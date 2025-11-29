const express = require("express");
const router = express.Router();

const { getSession } = require("../sessions");

router.get("/me", (req, res) => {
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
});

module.exports = router;
