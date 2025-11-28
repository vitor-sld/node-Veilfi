const express = require("express");
const router = express.Router();
const solanaWeb3 = require("@solana/web3.js");

router.post("/user/balance", async (req, res) => {
  try {
    const { userPubkey } = req.body;
console.log("RECEBIDO PELO BACKEND:", req.body);

    if (!userPubkey) {
      return res.status(400).json({ error: "Missing userPubkey" });
    }

    const connection = new solanaWeb3.Connection(
      solanaWeb3.clusterApiUrl("mainnet-beta"),
      "confirmed"
    );

    const publicKey = new solanaWeb3.PublicKey(userPubkey);
    const lamports = await connection.getBalance(publicKey);
    const sol = lamports / solanaWeb3.LAMPORTS_PER_SOL;

    return res.json({ balance: sol });
  } catch (err) {
    console.error("Erro balance:", err);
    return res.status(500).json({ error: "Balance error" });
  }
});
module.exports = router;
