// server/routes/swap.js
const express = require("express");
const router = express.Router();
const { quoteSwapLocal, executeSwapLocal } = require("../services/swap");

router.post("/quote", async (req, res) => {
  try {
    const { inputToken, inputAmount } = req.body;
    if (!inputToken || typeof inputAmount !== "number") {
      return res.status(400).json({ error: "Missing inputToken or inputAmount" });
    }

    const quote = await quoteSwapLocal({ inputToken, inputAmount });
    return res.json({ ok: true, quote });
  } catch (err) {
    console.error("/swap/quote error:", err);
    return res.status(500).json({ error: err.message || "Quote failed" });
  }
});

router.post("/execute", async (req, res) => {
  try {
    const { userPubkey, inputToken, inputAmount } = req.body;
    if (!userPubkey || !inputToken || typeof inputAmount !== "number") {
      return res.status(400).json({ error: "Missing fields" });
    }

    const { outputAmount } = await quoteSwapLocal({ inputToken, inputAmount });

    // In production you'd verify the user actually paid (on-chain) or reserved funds.
    // Here we assume payment was handled and we simply deliver tokens.
    const txSig = await executeSwapLocal({ userPubkey, outputAmount });
    return res.json({ ok: true, tx: txSig, outputAmount });
  } catch (err) {
    console.error("/swap/execute error:", err);
    return res.status(500).json({ error: err.message || "Execute failed" });
  }
});

module.exports = router;
