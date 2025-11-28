// server/routes/send.js
const express = require("express");
const router = express.Router();
const { getSession } = require("../sessions");

const {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  sendAndConfirmTransaction,
  Transaction
} = require("@solana/web3.js");

// RPC principal
const RPC_URL =
  "https://frequent-soft-daylight.solana-mainnet.quiknode.pro/db097341fa55b3a5bf3e5d96776910263c3a492a/";

// ========================================
// 🚀 ROTA REAL DE ENVIO DE SOL
// ========================================
router.post("/send", async (req, res) => {
  console.log("=== /wallet/send BEGIN ===");

  try {
    const sessionId = req.cookies?.sessionId;

    if (!sessionId) {
      return res.status(401).json({ ok: false, error: "NO_SESSION" });
    }

    const userSession = getSession(sessionId);

    if (!userSession) {
      return res.status(401).json({ ok: false, error: "INVALID_SESSION" });
    }

    const { walletPubkey, secretKey } = userSession;

    if (!walletPubkey || !secretKey) {
      return res.status(400).json({ ok: false, error: "SESSION_NO_KEYPAIR" });
    }

    const { to, amount } = req.body;

    if (!to || typeof to !== "string") {
      return res.status(400).json({ ok: false, error: "INVALID_DESTINATION" });
    }

    if (!amount || typeof amount !== "number" || amount <= 0) {
      return res.status(400).json({ ok: false, error: "INVALID_AMOUNT" });
    }

    const lamports = Math.floor(amount * 1e9); // Convert SOL -> lamports

    const connection = new Connection(RPC_URL, "confirmed");

    const fromKeypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));
    const toPubkey = new PublicKey(to);

    console.log("FROM:", fromKeypair.publicKey.toBase58());
    console.log("TO:", toPubkey.toBase58());
    console.log("Sending lamports:", lamports);

    // Criar transação
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: fromKeypair.publicKey,
        toPubkey,
        lamports,
      })
    );

    // Enviar
    const signature = await sendAndConfirmTransaction(connection, tx, [
      fromKeypair,
    ]);

    console.log("✔ TRANSACTION CONFIRMED:", signature);

    return res.json({
      ok: true,
      signature,
      explorer: `https://explorer.solana.com/tx/${signature}`,
    });
  } catch (err) {
    console.error("❌ SEND ERROR:", err);
    return res.status(500).json({
      ok: false,
      error: "SEND_FAILED",
      details: err.message,
    });
  }
});

module.exports = router;
