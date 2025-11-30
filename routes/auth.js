// server/routes/auth.js
const express = require("express");
const router = express.Router();
const { Keypair } = require("@solana/web3.js");

/* ======================================================
   POST /auth/import → Salvar wallet local na sessão
====================================================== */
router.post("/import", async (req, res) => {
  try {
    const { input, name } = req.body;

    if (!input) {
      return res.status(400).json({ ok: false, error: "NO_INPUT" });
    }

    let arr;
    try {
      arr = JSON.parse(input);
    } catch {
      return res.status(400).json({ ok: false, error: "BAD_SECRET_KEY" });
    }

    if (!Array.isArray(arr) || arr.length !== 64) {
      return res.status(400).json({ ok: false, error: "INVALID_SECRET_KEY" });
    }

    const secretKey = Uint8Array.from(arr);
    const keypair = Keypair.fromSecretKey(secretKey);

    // 🔥 SALVANDO A WALLET LOCAL NA SESSÃO
    req.session.sessionObject = {
      walletPubkey: keypair.publicKey.toBase58(),
      secretKey: arr,
      name: name || null,
    };

    req.session.save(() => {
      return res.json({
        ok: true,
        walletPubkey: keypair.publicKey.toBase58(),
      });
    });
  } catch (e) {
    console.error("IMPORT ERROR:", e);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

module.exports = router;
