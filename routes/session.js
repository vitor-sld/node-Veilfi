// server/routes/session.js
const express = require("express");
const router = express.Router();
const { getSession } = require("../sessions");

router.get("/me", (req, res) => {
  try {
    const session = getSession(req);

    if (!session) {
      return res.json({ ok: false });
    }

    return res.json({
      ok: true,
      user: {
        walletPubkey: session.walletPubkey
      }
    });

  } catch (err) {
    console.error("SESSION ERROR:", err);
    return res.status(500).json({ ok: false, error: "SESSION_FAILED" });
  }
});

module.exports = router;
