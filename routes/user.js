// server/routes/user.js
const express = require("express");
const router = express.Router();
const { PublicKey, Connection } = require("@solana/web3.js");

const RPC_URL = "https://frequent-soft-daylight.solana-mainnet.quiknode.pro/db097341fa55b3a5bf3e5d96776910263c3a492a/";
const connection = new Connection(RPC_URL);

// GET BALANCE
router.post("/balance", async (req, res) => {
  try {
    const pub = req.body.userPubkey;

    if (!pub) {
      return res.status(400).json({ error: "userPubkey required" });
    }

    const lamports = await connection.getBalance(new PublicKey(pub));

    return res.json({
      balance: lamports / 1e9,
    });

  } catch (err) {
    console.error("BALANCE ERROR:", err);
    return res.status(500).json({ error: "BALANCE_ERROR" });
  }
});

module.exports = router;
