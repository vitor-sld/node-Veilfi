// server/routes/user.js
const express = require("express");
const router = express.Router();
const { connection } = require("../services/solana");
const { PublicKey } = require("@solana/web3.js");

// Rota para pegar saldo SOL do usuário
router.post("/balance", async (req, res) => {
  try {
    const { walletPubkey } = req.body;

    if (!walletPubkey) {
      return res.status(400).json({
        ok: false,
        message: "walletPubkey obrigatório"
      });
    }

    const pubkey = new PublicKey(walletPubkey);

    // saldo em lamports
    const lamports = await connection.getBalance(pubkey);
    const sol = lamports / 1e9;

    return res.json({
      ok: true,
      balance: sol
    });

  } catch (e) {
    console.error("Erro em /user/balance:", e);
    return res.status(500).json({
      ok: false,
      message: "Erro interno ao pegar saldo"
    });
  }
});

module.exports = router;
