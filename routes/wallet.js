const express = require("express");
const router = express.Router();
const { connection } = require("../services/solana");

// Verificar depósito
router.post("/deposit/check", async (req, res) => {
  try {
    const { signature } = req.body;

    if (!signature) return res.json({ ok: false, message: "signature obrigatória" });

    const tx = await connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0
    });

    if (!tx) return res.json({ ok: false, message: "Transação não encontrada" });

    const amount = tx.meta.postBalances[0] - tx.meta.preBalances[0];
    const sol = amount / 1e9;

    if (!req.session.user) return res.json({ ok: false, message: "Usuário não logado" });

    req.session.user.balanceSol =
      (req.session.user.balanceSol || 0) + sol;

    res.json({
      ok: true,
      amount: sol,
      newBalance: req.session.user.balanceSol
    });

  } catch (err) {
    console.error(err);
    res.json({ ok: false, message: "Erro interno" });
  }
});

module.exports = router;
