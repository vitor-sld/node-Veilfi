// routes/wallet.js
const express = require("express");
const router = express.Router();
const { getSolanaWalletInfo } = require("../services/solana");

// POST /wallet/balance
router.post("/user/balance", async (req, res) => {
  try {
    const { userPubkey } = req.body;
    if (!userPubkey) return res.status(400).json({ error: "Missing userPubkey" });

    const info = await getSolanaWalletInfo(userPubkey);
    return res.json(info);

  } catch (e) {
    console.error("wallet/balance error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
