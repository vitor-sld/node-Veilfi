// server/routes/session.js
const express = require("express");
const router = express.Router();

/* ======================================================
   GET /session/me → retorna wallet salva na sessão
====================================================== */
router.get("/me", (req, res) => {
  const session = req.session?.sessionObject ?? null;

  if (!session) {
    return res.json({ ok: false, user: null });
  }

  return res.json({
    ok: true,
    user: session,
  });
});

module.exports = router;
