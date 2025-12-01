// ========================
//  swap.js — SOL <-> USDT (Raydium API)
// ========================

require("dotenv").config();
const express = require("express");
const router = express.Router();
const {
  Connection,
  PublicKey,
  Keypair,
  VersionedTransaction,
} = require("@solana/web3.js");

const bs58 = require("bs58");
const fetch = require("node-fetch");

// ================================
// Função universal para converter secretKey (string base58 ou array)
// ================================
function toUint8Array(secretKey) {
  try {
    if (!secretKey) throw new Error("SecretKey vazia.");

    // Base58
    if (typeof secretKey === "string" && !secretKey.startsWith("[")) {
      return bs58.decode(secretKey);
    }

    // Array JSON
    if (typeof secretKey === "string" && secretKey.startsWith("[")) {
      return Uint8Array.from(JSON.parse(secretKey));
    }

    // Array real
    if (Array.isArray(secretKey)) {
      return Uint8Array.from(secretKey);
    }

    throw new Error("Formato de chave desconhecido.");
  } catch (err) {
    console.error("ERRO convertendo secretKey:", err);
    throw new Error("Chave privada inválida.");
  }
}

// ================================
// TOKENS OFICIAIS
// ================================
const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDT_MINT = "Es9vMFrzaCERyN2rj8qJea2orGZf4d2Lr8DQJHuhJZ";

// ================================
// RPC
// ================================
const connection = new Connection(
  "https://api.mainnet-beta.solana.com",
  "confirmed"
);

// ================================
// SWAP RAYDIUM — v3 API
// ================================
router.post("/usdt", async (req, res) => {
  try {
    console.log("=== RAYDIUM SWAP REQUEST ===");

    const {
      carteiraUsuarioPublica,
      carteiraUsuarioPrivada,
      amount,
      direction,
    } = req.body;

    console.log("Public:", carteiraUsuarioPublica);
    console.log("Private (base58):", carteiraUsuarioPrivada);
    console.log("Amount:", amount);
    console.log("Direction:", direction);

    if (!carteiraUsuarioPublica || !carteiraUsuarioPrivada || !amount || !direction) {
      return res.status(400).json({ error: "Dados incompletos." });
    }

    // Converter privateKey
    const privateKeyArray = toUint8Array(carteiraUsuarioPrivada);
    const userKeypair = Keypair.fromSecretKey(privateKeyArray);
    const userPubkey = new PublicKey(carteiraUsuarioPublica);

    // Definir mints
    let inputMint, outputMint, atomicAmount;

    if (direction === "SOL_TO_USDT") {
      inputMint = SOL_MINT;
      outputMint = USDT_MINT;
      atomicAmount = Math.floor(parseFloat(amount) * 1e9);

    } else if (direction === "USDT_TO_SOL") {
      inputMint = USDT_MINT;
      outputMint = SOL_MINT;
      atomicAmount = Math.floor(parseFloat(amount) * 1e6);

    } else {
      return res.status(400).json({ error: "Direção inválida." });
    }

    // ========================================
    // 1) RAYDIUM QUOTE (v3)
    // ========================================
    const quoteUrl = `https://api.raydium.io/v3/amm/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${atomicAmount}`;

    console.log("Quote URL:", quoteUrl);

    const quoteResp = await fetch(quoteUrl);
    const quoteJson = await quoteResp.json();

    console.log("QUOTE RESPONSE RAW:", quoteJson);

    if (!quoteJson.outAmount) {
      return res.status(500).json({
        error: "Raydium não retornou cotação.",
        details: quoteJson,
      });
    }

    // ========================================
    // 2) OBTER TRANSAÇÃO DE SWAP
    // ========================================
    const swapResp = await fetch("https://api.raydium.io/v2/sdk/amm/swap", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        inputMint,
        outputMint,
        amount: atomicAmount,
        publicKey: userPubkey.toBase58(),
      }),
    });

    const swapJson = await swapResp.json();

    console.log("SWAP RESPONSE RAW:", swapJson);

    if (!swapJson.swapTransaction) {
      return res.status(500).json({
        error: "Raydium não retornou transação de swap.",
        details: swapJson,
      });
    }

    // ========================================
    // 3) ASSINAR TRANSAÇÃO
    // ========================================
    const txBuffer = Buffer.from(swapJson.swapTransaction, "base64");
    const tx = VersionedTransaction.deserialize(txBuffer);

    tx.sign([userKeypair]);

    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
    });

    console.log("ASSINATURA:", signature);

    await connection.confirmTransaction(signature, "confirmed");

    // ========================================
    // 4) SUCESSO
    // ========================================
    return res.json({
      sucesso: true,
      assinatura: signature,
      recebido: quoteJson.outAmount,
      direction,
    });

  } catch (err) {
    console.error("ERRO NO SWAP:", err);
    return res.status(500).json({
      error: "Erro no swap.",
      details: err.message,
    });
  }
});

module.exports = router;
