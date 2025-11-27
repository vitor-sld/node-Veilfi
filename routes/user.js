const express = require("express");
const router = express.Router();
const swapService = require("../services/swap");

router.post("/execute", async (req, res) => {
  try {
    const { userPubkey, fromMint, toMint, amount } = req.body;

    if (!userPubkey || !fromMint || !toMint || !amount)
      return res.status(400).json({ error: "Missing fields" });

    const tx = await swapService.executeSwap({
      userPubkey,
      fromMint,
      toMint,
      amount,
    });

    return res.json({ ok: true, tx });
  } catch (err) {
    console.error("swap error:", err);
    return res.status(500).json({ error: "Swap failed" });
  }
});

module.exports = router;
