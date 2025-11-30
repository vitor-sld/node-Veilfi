// server/routes/session.js
const express = require("express");
const router = express.Router();

router.get("/me", (req, res) => {
  try {
    const sess = req.session?.sessionObject ?? null;

    if (!sess) {
      return res.json({ ok: false, user: null });
    }

    return res.json({
      ok: true,
      user: {
        walletPubkey: sess.walletPubkey || null,
        secretKey: sess.secretKey || null,
        name: sess.name || null,
      },
    });

  } catch (e) {
    console.error("SESSION ERROR:", e);
    return res.status(500).json({ ok: false, error: "SESSION_ERROR" });
  }
});

module.exports = router;
