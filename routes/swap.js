// ==========================================================
//   swap.js — SOL <-> USDC (Raydium API v3)
// ==========================================================

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

// ==========================================================
// CONVERSOR UNIVERSAL DE CHAVE PRIVADA (base58 ou array)
// ==========================================================
function toUint8Array(secretKey) {
  try {
    if (!secretKey) throw new Error("SecretKey vazia.");

    if (typeof secretKey === "string" && !secretKey.startsWith("[")) {
      return bs58.decode(secretKey); // base58
    }

    if (typeof secretKey === "string" && secretKey.startsWith("[")) {
      return Uint8Array.from(JSON.parse(secretKey)); // array JSON
    }

    if (Array.isArray(secretKey)) {
      return Uint8Array.from(secretKey);
    }

    throw new Error("Formato desconhecido de secretKey.");
  } catch (err) {
    console.error("Erro na conversão da chave privada:", err);
    throw new Error("Chave privada inválida.");
  }
}

// ==========================================================
// TOKENS OFICIAIS
// ==========================================================
const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G3ky6a9qZ7bL92"; // ★ USDC OFICIAL

// ==========================================================
// RPC
// ==========================================================
const connection = new Connection(
  "https://api.mainnet-beta.solana.com",
  "confirmed"
);

// ==========================================================
//     SWAP RAYDIUM — SOL <-> USDC
// ==========================================================
router.post("/usdc", async (req, res) => {
  try {
    console.log("=== RAYDIUM SWAP USDC ===");

    const {
      carteiraUsuarioPublica,
      carteiraUsuarioPrivada,
      amount,
      direction,
    } = req.body;

    if (!carteiraUsuarioPublica || !carteiraUsuarioPrivada || !amount || !direction) {
      return res.status(400).json({ error: "Dados incompletos." });
    }

    // Converter chave privada
    const privateKeyArray = toUint8Array(carteiraUsuarioPrivada);
    const userKeypair = Keypair.fromSecretKey(privateKeyArray);
    const userPubkey = new PublicKey(carteiraUsuarioPublica.trim());

    // Definir mints
    let inputMint, outputMint, atomicAmount;

    if (direction === "SOL_TO_USDC") {
      inputMint = SOL_MINT;
      outputMint = USDC_MINT;
      atomicAmount = Math.floor(parseFloat(amount) * 1e9); // SOL decimais = 9

    } else if (direction === "USDC_TO_SOL") {
      inputMint = USDC_MINT;
      outputMint = SOL_MINT;
      atomicAmount = Math.floor(parseFloat(amount) * 1e6); // USDC decimais = 6

    } else {
      return res.status(400).json({ error: "Direção inválida." });
    }

    // ==========================================================
    // 1 — RAYDIUM QUOTE v3
    // ==========================================================
    const quoteUrl = `https://api.raydium.io/v3/amm/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${atomicAmount}`;

    console.log("Quote URL:", quoteUrl);

    const quoteResp = await fetch(quoteUrl);
    const quoteJson = await quoteResp.json();

    console.log("QUOTE RAW:", quoteJson);

    if (!quoteJson.outAmount) {
      return res.status(500).json({
        error: "Raydium não retornou cotação.",
        details: quoteJson,
      });
    }

    // ==========================================================
    // 2 — OBTER TRANSAÇÃO (Raydium Swap Builder)
    // ==========================================================
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

    console.log("SWAP RAW:", swapJson);

    if (!swapJson.swapTransaction) {
      return res.status(500).json({
        error: "Raydium não retornou transação de swap.",
        details: swapJson,
      });
    }

    // ==========================================================
    // 3 — ASSINAR TRANSAÇÃO
    // ==========================================================
    const txBuffer = Buffer.from(swapJson.swapTransaction, "base64");
    const tx = VersionedTransaction.deserialize(txBuffer);

    tx.sign([userKeypair]);

    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
    });

    console.log("ASSINATURA:", signature);

    await connection.confirmTransaction(signature, "confirmed");

    // ==========================================================
    // 4 — SUCESSO
    // ==========================================================
    return res.json({
      sucesso: true,
      assinatura: signature,
      recebido: quoteJson.outAmount,
      direction,
    });

  } catch (err) {
    console.error("ERRO NO SWAP USDC:", err);
    return res.status(500).json({
      error: "Erro no swap.",
      details: err.message,
    });
  }
});

module.exports = router;
