const express = require("express");
const router = express.Router();
const { getSolanaWalletInfo } = require("../services/solana");

router.get("/balance", async (req, res) => {
  try {
    const address = req.query.address;
    if (!address) return res.status(400).json({ error: "Missing address" });

    const info = await getSolanaWalletInfo(address);
    return res.json(info);

  } catch (e) {
    console.error("wallet/balance error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
