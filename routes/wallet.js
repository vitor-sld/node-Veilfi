// server/routes/wallet.js
const express = require("express");
const router = express.Router();

const {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} = require("@solana/web3.js");

const { getSession } = require("../sessions");

const RPC_URL =
  "https://frequent-soft-daylight.solana-mainnet.quiknode.pro/db097341fa55b3a5bf3e5d96776910263c3a492a/";

const connection = new Connection(RPC_URL, "confirmed");

/* ========= BALANCE ========= */
router.post("/balance", async (req, res) => {
  try {
    const { userPubkey } = req.body;

    if (!userPubkey)
      return res.status(400).json({ error: "userPubkey required" });

    const lamports = await connection.getBalance(new PublicKey(userPubkey));
    return res.json({ ok: true, balance: lamports / 1e9 });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "BALANCE_FAILED" });
  }
});

/* ========= SEND SOL ========= */
router.post("/send", async (req, res) => {
  try {
    const session = getSession(req);

    if (!session)
      return res.status(401).json({ ok: false, error: "NO_SESSION" });

    const { walletPubkey, secretKey } = session;

    const { to, amount } = req.body;

    if (!to) return res.status(400).json({ error: "INVALID_TO" });
    if (!amount || amount <= 0)
      return res.status(400).json({ error: "INVALID_AMOUNT" });

    const fromKeypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));
    const lamports = Math.floor(amount * 1e9);

    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: fromKeypair.publicKey,
        toPubkey: new PublicKey(to),
        lamports,
      })
    );

    const sig = await sendAndConfirmTransaction(connection, tx, [
      fromKeypair,
    ]);

    return res.json({
      ok: true,
      signature: sig,
      explorer: `https://explorer.solana.com/tx/${sig}`,
    });
  } catch (err) {
    console.error("SEND ERROR:", err);
    return res.status(500).json({ ok: false, error: "SEND_FAILED" });
  }
});

module.exports = router;
