// server/routes/send.js
const express = require("express");
const router = express.Router();
const {
  getSession
} = require("../sessions");

const {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  sendAndConfirmTransaction
} = require("@solana/web3.js");
const walletController = require("../controllers/walletController");
// RPC atual — você pode ajustar depois
const RPC_URL = "https://frequent-soft-daylight.solana-mainnet.quiknode.pro/db097341fa55b3a5bf3e5d96776910263c3a492a/";

router.post("/", async (req, res) => {
  console.log("=== PART 3 /tx/send REAL SOLANA TRANSACTION ===");
router.post("/send", walletController.sendSOL);
  try {
    const sessionId = req.cookies?.sessionId;

    if (!sessionId) {
      console.log("No session cookie");
      return res.status(401).json({ ok: false, error: "NO_SESSION" });
    }

    const userSession = getSession(sessionId);

    if (!userSession) {
      console.log("Session not found");
      return res.status(401).json({ ok: false, error: "INVALID_SESSION" });
    }

    const { walletPubkey, secretKey } = userSession;

    if (!walletPubkey || !secretKey) {
      console.log("Session missing keypair");
      return res.status(400).json({ ok: false, error: "SESSION_NO_KEYPAIR" });
    }

    const { to, amount } = req.body;

    console.log("Received send request:", { to, amount });

    if (!to || typeof to !== "string") {
      return res.status(400).json({ ok: false, error: "INVALID_DESTINATION" });
    }

    if (!amount || typeof amount !== "number" || amount <= 0) {
      return res.status(400).json({ ok: false, error: "INVALID_AMOUNT" });
    }

    const lamports = Math.floor(amount * 1_000_000_000);

    console.log("Lamports to send:", lamports);

    // 1. Conectar ao RPC
    const connection = new Connection(RPC_URL, "confirmed");

    // 2. Reconstruir keypair da sessão
    const fromKeypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));
    const toPubkey = new PublicKey(to);

    console.log("FROM:", fromKeypair.publicKey.toBase58());
    console.log("TO:", toPubkey.toBase58());

    // 3. Criar instrução de envio
    const transaction = new (require("@solana/web3.js").Transaction)().add(
      SystemProgram.transfer({
        fromPubkey: fromKeypair.publicKey,
        toPubkey,
        lamports,
      })
    );

    // 4. Enviar transação real
    console.log("Sending transaction...");
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [fromKeypair],
      { commitment: "confirmed" }
    );

    console.log("=== TRANSACTION CONFIRMED ===");
    console.log("Signature:", signature);

    return res.json({
      ok: true,
      signature,
      explorer: `https://explorer.solana.com/tx/${signature}`
    });

  } catch (err) {
    console.error("SEND ERROR:", err);
    return res.status(500).json({
      ok: false,
      error: "SEND_FAILED",
      details: err.message
    });
  }
});

module.exports = router;
