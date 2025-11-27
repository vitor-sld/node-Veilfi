const express = require("express");
const router = express.Router();

const { getSolanaWalletInfo } = require("../services/solana");

router.post("/balance", async (req, res) => {
  try {
    const { userPubkey } = req.body;

    if (!userPubkey) {
      return res.status(400).json({ error: "Missing pubkey" });
    }

    console.log("📡 Buscando saldo de:", userPubkey);

    const info = await getSolanaWalletInfo(userPubkey);

    return res.json({
      solBalance: info.solBalance ?? 0,
      tokens: info.tokens ?? []
    });

  } catch (err) {
    console.error("❌ /user/balance error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
