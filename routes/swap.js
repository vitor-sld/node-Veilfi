// ========================================================
//  VeilFi - Jupiter Swap (Public API) — NO API KEY NEEDED
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
const fetch = require("node-fetch");

// RPC normal da Solana
const connection = new Connection(
  "https://api.mainnet-beta.solana.com",
  "confirmed"
);

// ========================================================
//  Converte a privateKey (sempre base58 do frontend)
// ========================================================
function parsePrivateKey(raw) {
  try {
    return Keypair.fromSecretKey(bs58.decode(raw));
  } catch (e) {
    console.error("Erro parsePrivateKey:", e);
    throw new Error("Chave privada inválida (não é base58).");
  }
}

// ========================================================
//  SWAP Jupiter (Public API)
// ========================================================
router.post("/jupiter", async (req, res) => {
  try {
    const { carteiraUsuarioPublica, carteiraUsuarioPrivada, amount, direction } =
      req.body;

    if (!carteiraUsuarioPublica)
      return res.status(400).json({ error: "Falta carteiraUsuarioPublica" });
    if (!carteiraUsuarioPrivada)
      return res.status(400).json({ error: "Falta carteiraUsuarioPrivada" });

    // Mints oficiais
    const SOL = "So11111111111111111111111111111111111111112";
    const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G3ky6a9qZ7bL92";

    let inputMint, outputMint, atomicAmount;

    // ====================================================
    // Conversão dependendo da direção (SOL ↔ USDC)
    // ====================================================
    if (direction === "SOL_TO_USDC") {
      inputMint = SOL;
      outputMint = USDC;
      atomicAmount = Math.floor(Number(amount) * 1e9); // lamports

    } else if (direction === "USDC_TO_SOL") {
      inputMint = USDC;
      outputMint = SOL;
      atomicAmount = Math.floor(Number(amount) * 1e6); // USDC decimals

    } else {
      return res.status(400).json({ error: "Direção inválida." });
    }

    console.log("=== JUPITER SWAP REQUEST ===");
    console.log("Input Mint:", inputMint);
    console.log("Output Mint:", outputMint);
    console.log("Lamports:", atomicAmount);

    // ====================================================
    // 1) QUOTE via API pública
    // ====================================================
    const quoteUrl =
      `https://public.jupiterapi.com/quote?` +
      `inputMint=${inputMint}&outputMint=${outputMint}&amount=${atomicAmount}`;

    console.log("QUOTE URL:", quoteUrl);

    const quoteRes = await fetch(quoteUrl);
    const quoteJson = await quoteRes.json();

    if (!quoteJson.outAmount) {
      console.error("Quote error:", quoteJson);
      return res.status(500).json({
        error: "Jupiter quote failed",
        status: quoteRes.status,
        body: quoteJson,
      });
    }

    // ====================================================
    // 2) Pegar a TRANSAÇÃO pronta (swap-instructions)
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
      console.error("Swap instructions missing:", swapJson);
      return res.status(500).json({
        error: "Swap instructions inválidas",
        details: swapJson,
      });
    }

    // ====================================================
    // 3) ASSINAR A TRANSAÇÃO
    // ====================================================
    const userKeypair = parsePrivateKey(carteiraUsuarioPrivada);

    const txBuffer = Buffer.from(swapJson.swapTransaction, "base64");
    const tx = VersionedTransaction.deserialize(txBuffer);

    tx.sign([userKeypair]);

    // ====================================================
    // 4) ENVIAR PARA A REDE
    // ====================================================
    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
    });

    await connection.confirmTransaction(signature, "confirmed");

    console.log("SWAP SIGNATURE:", signature);

    return res.json({
      sucesso: true,
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
