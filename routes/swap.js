// ========================================================
//  VeilFi - Jupiter Swap (Public API) — Node18+
//  TOTALMENTE COMPATÍVEL COM RENDER
// ========================================================
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

// RPC principal
const connection = new Connection(
  "https://api.mainnet-beta.solana.com",
  "confirmed"
);

// ========================================================
// Converte PRIVATE KEY BASE58 → Keypair
// ========================================================
function parsePrivateKey(raw) {
  try {
    const keypair = Keypair.fromSecretKey(bs58.decode(raw));
    return keypair;
  } catch (e) {
    console.error("Erro parsePrivateKey:", e);
    throw new Error("Chave privada inválida.");
  }
}

// ========================================================
//  ROTA DO SWAP JUPITER
// ========================================================
router.post("/jupiter", async (req, res) => {
  try {
    let {
      carteiraUsuarioPublica,
      carteiraUsuarioPrivada,
      amount,
      direction,
    } = req.body;

    if (!carteiraUsuarioPublica)
      return res.status(400).json({ error: "Falta carteiraUsuarioPublica" });
    if (!carteiraUsuarioPrivada)
      return res.status(400).json({ error: "Falta carteiraUsuarioPrivada" });

    // Mints oficiais
    const SOL = "So11111111111111111111111111111111111111112";
    const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G3ky6a9qZ7bL92";

    let inputMint, outputMint, atomicAmount;

    // ====================================================
    // Converter amount
    // ====================================================
    if (direction === "SOL_TO_USDC") {
      inputMint = SOL;
      outputMint = USDC;
      atomicAmount = Math.floor(Number(amount) * 1e9); // lamports
    } else if (direction === "USDC_TO_SOL") {
      inputMint = USDC;
      outputMint = SOL;
      atomicAmount = Math.floor(Number(amount) * 1e6); // USDC
    } else {
      return res.status(400).json({ error: "Direção inválida." });
    }

    console.log("QUOTE REQUEST:", {
      inputMint,
      outputMint,
      atomicAmount,
    });

    // ====================================================
    // 1) QUOTE — Jupiter PUBLIC API
    // ====================================================
    const quoteUrl =
      `https://public.jupiterapi.com/quote?` +
      `inputMint=${inputMint}&outputMint=${outputMint}&amount=${atomicAmount}`;

    const quoteRes = await fetch(quoteUrl);
    const quoteJson = await quoteRes.json();

    if (!quoteJson.outAmount) {
      console.log("Quote error:", quoteJson);
      return res.status(500).json({
        error: "Jupiter quote failed",
        status: quoteRes.status,
        body: quoteJson,
      });
    }

    // ====================================================
    // 2) GET swap instructions
    // ====================================================
    const swapRes = await fetch(
      "https://public.jupiterapi.com/swap-instructions",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          quoteResponse: quoteJson,
          userPublicKey: carteiraUsuarioPublica,
        }),
      }
    );

    const swapJson = await swapRes.json();

    if (!swapJson.swapTransaction) {
      console.log("Swap error:", swapJson);
      return res.status(500).json({
        error: "Swap instructions inválidas",
        details: swapJson,
      });
    }

    // ====================================================
    // 3) ASSINAR
    // ====================================================
    const keypair = parsePrivateKey(carteiraUsuarioPrivada);

    const txBuffer = Buffer.from(swapJson.swapTransaction, "base64");
    const tx = VersionedTransaction.deserialize(txBuffer);

    tx.sign([keypair]);

    // ====================================================
    // 4) ENVIAR PARA A BLOCKCHAIN
    // ====================================================
    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
    });

    await connection.confirmTransaction(signature, "confirmed");

    console.log("TX SIGNATURE:", signature);

    return res.json({
      ok: true,
      signature,
      direction,
      sent: amount,
      received: quoteJson.outAmount,
    });

  } catch (err) {
    console.error("JUPITER SWAP ERROR:", err);
    return res.status(500).json({
      error: "Erro ao executar swap.",
      details: err.message,
    });
  }
});

module.exports = router;
