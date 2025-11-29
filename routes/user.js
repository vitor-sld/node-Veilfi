// server/routes/user.js
const express = require("express");
const router = express.Router();

router.get("/me", (req, res) => {
  if (!req.sessionObject) return res.json({ ok: false });
  return res.json({ ok: true, user: req.sessionObject });
});

module.exports = router;
