const express = require("express");
const router = express.Router();

router.get("/me", (req, res) => {
  if (!req.session.user) return res.json({ ok: false });

  res.json({
    ok: true,
    user: req.session.user
  });
});

router.post("/login", (req, res) => {
  const { walletPubkey } = req.body;

  if (!walletPubkey) {
    return res.status(400).json({ ok: false, message: "walletPubkey obrigatório" });
  }

  req.session.user = { walletPubkey, balanceSol: 0 };
  res.json({ ok: true });
});

module.exports = router;
