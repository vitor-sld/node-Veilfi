// server/routes/wallet.js
const express = require("express");
const router = express.Router();
const { getSolanaWalletInfo } = require("../services/solana");

router.get("/balance", async (req, res) => {
  try {
    const address = req.query.address;
    if (!address) {
      return res.status(400).json({ error: "Missing address" });
    }

    const info = await getSolanaWalletInfo(address);

    // retorna no formato que o front espera:
    return res.json({
      sol: info.solBalance,
      tokens: info.tokens
    });

  } catch (err) {
    console.error("wallet/balance error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
