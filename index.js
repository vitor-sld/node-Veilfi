// server/routes/wallet.js
const express = require("express");
const router = express.Router();

const {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction
} = require("@solana/web3.js");

const { getSession } = require("../sessions");

// RPC
const RPC_URL =
  "https://frequent-soft-daylight.solana-mainnet.quiknode.pro/db097341fa55b3a5bf3e5d96776910263c3a492a/";

// ==============================
// GET BALANCE
// ==============================
router.post("/balance", async (req, res) => {
  try {
    const { userPubkey } = req.body;

    if (!userPubkey) {
      return res.status(400).json({ ok: false, error: "NO_PUBKEY" });
    }

    const connection = new Connection(RPC_URL);
    const lamports = await connection.getBalance(new PublicKey(userPubkey));

    return res.json({
      ok: true,
      balance: lamports / 1e9,
    });
  } catch (err) {
    console.error("BALANCE ERROR:", err);
    return res.status(500).json({
      ok: false,
      error: "BALANCE_FAILED",
      details: err.message,
    });
  }
});

// ==============================
// SEND SOL
// ==============================
router.post("/send", async (req, res) => {
  try {
    const session = getSession(req);

    if (!session)
      return res.status(401).json({ ok: false, error: "NO_SESSION" });

    const { walletPubkey, secretKey } = session;

    if (!walletPubkey || !secretKey)
      return res
        .status(400)
        .json({ ok: false, error: "SESSION_NO_KEYPAIR" });

    const { to, amount } = req.body;

    if (!to || typeof to !== "string")
      return res.status(400).json({ ok: false, error: "INVALID_TO" });

    if (!amount || amount <= 0)
      return res.status(400).json({ ok: false, error: "INVALID_AMOUNT" });

    const lamports = Math.floor(amount * 1e9);

    const connection = new Connection(RPC_URL, "confirmed");

    const fromKeypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));
    const toPubkey = new PublicKey(to);

    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: fromKeypair.publicKey,
        toPubkey,
        lamports,
      })
    );

    const signature = await sendAndConfirmTransaction(
      connection,
      tx,
      [fromKeypair],
      { commitment: "confirmed" }
    );

    return res.json({
      ok: true,
      signature,
      explorer: `https://explorer.solana.com/tx/${signature}`,
    });
  } catch (err) {
    console.error("SEND ERROR:", err);
    return res.status(500).json({
      ok: false,
      error: "SEND_FAILED",
      details: err.message,
    });
  }
});

module.exports = router;
