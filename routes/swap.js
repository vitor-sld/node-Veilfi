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

// ================================
// Função universal para converter secretKey
// ================================
function toUint8Array(secretKey) {
  try {
    if (!secretKey) throw new Error("SecretKey vazia.");

    // Base58 (começa com 3xhGX... etc)
    if (typeof secretKey === "string" && !secretKey.startsWith("[")) {
      return bs58.decode(secretKey);
    }

    // Array em string "[1,2,3]"
    if (typeof secretKey === "string" && secretKey.startsWith("[")) {
      return Uint8Array.from(JSON.parse(secretKey));
    }

    // Array real
    if (Array.isArray(secretKey)) {
      return Uint8Array.from(secretKey);
    }

    // Uint8Array direto
    if (secretKey instanceof Uint8Array) {
      return secretKey;
    }

    throw new Error("Formato desconhecido.");
  } catch (err) {
    console.error("ERRO CONVERSÃO DE CHAVE:", err);
    throw new Error("SecretKey inválida.");
  }
}

// ================================
// TOKENS OFICIAIS
// ================================
const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDT_MINT = "Es9vMFrzaCERyN2Rrj8qJeT2orGZf4d2Lr8DQJHuhJZ";

// ================================
// RPC
// ================================
const connection = new Connection(
  "https://api.mainnet-beta.solana.com",
  "confirmed"
);

// ================================
// SWAP RAYDIUM — SOL <-> USDT
// ================================
router.post("/usdt", async (req, res) => {
  try {
    console.log("=== RAYDIUM SWAP TEST ===");

    const {
      carteiraUsuarioPublica,
      carteiraUsuarioPrivada,
      amount,
      direction,
    } = req.body;

    console.log("Public:", carteiraUsuarioPublica);
    console.log("PRIVATE RAW:", carteiraUsuarioPrivada);

    if (!carteiraUsuarioPublica || !carteiraUsuarioPrivada || !amount || !direction) {
      return res.status(400).json({ error: "Dados incompletos." });
    }

    // Converter a chave privada
    const privateKeyArray = toUint8Array(carteiraUsuarioPrivada);
    const userKeypair = Keypair.fromSecretKey(privateKeyArray);
    const userPk = new PublicKey(carteiraUsuarioPublica);

    // Definir par do swap
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

    // ----------------------------
    // 1) Pedir cotação para Raydium
    // ----------------------------
    const quoteUrl = `https://api.raydium.io/v2/sdk/amm/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${atomicAmount}`;

    console.log("Raydium Quote URL:", quoteUrl);

    const quoteResp = await fetch(quoteUrl);
    const quoteJson = await quoteResp.json();

    console.log("Raydium Quote Response:", quoteJson);

    if (!quoteJson.outAmount) {
      return res.status(500).json({
        error: "Raydium não retornou cotação.",
        details: quoteJson,
      });
    }

    // ----------------------------
    // 2) Obter transação assinável
    // ----------------------------
    const swapResp = await fetch("https://api.raydium.io/v2/sdk/amm/swap", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        inputMint,
        outputMint,
        amount: atomicAmount,
        publicKey: userPk.toBase58(),
      }),
    });

    const swapJson = await swapResp.json();

    console.log("Raydium Swap Response:", swapJson);

    if (!swapJson.swapTransaction) {
      return res.status(500).json({
        error: "Raydium não retornou transação.",
        details: swapJson,
      });
    }

    // ----------------------------
    // 3) Assinar e enviar
    // ----------------------------
    const txBuffer = Buffer.from(swapJson.swapTransaction, "base64");
    const tx = VersionedTransaction.deserialize(txBuffer);

    tx.sign([userKeypair]);

    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
    });

    console.log("Swap Signature:", signature);

    await connection.confirmTransaction(signature, "confirmed");

    // ----------------------------
    // 4) Retorno
    // ----------------------------
    return res.json({
      sucesso: true,
      assinatura: signature,
      recebido: quoteJson.outAmount,
      direction,
    });

  } catch (err) {
    console.error("Erro no swap:", err);
    return res.status(500).json({ error: "Erro no swap.", details: err.message });
  }
});

module.exports = router;
