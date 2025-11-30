// server/routes/auth.js
const express = require("express");
const router = express.Router();
const { Keypair } = require("@solana/web3.js");

/* ======================================================
   POST /auth/import → Salva wallet local na sessão
====================================================== */
router.post("/import", async (req, res) => {
  try {
    console.log("RAW BODY:", req.body);
    console.log("INPUT RAW:", req.body.input);

    const { input, name } = req.body;

    if (!input) {
      return res.status(400).json({ ok: false, error: "NO_INPUT" });
    }

    let arr = input;

    // Se vier como string, tentar converter
    if (typeof arr === "string") {
      try {
        arr = JSON.parse(arr);
      } catch (e) {
        console.log("JSON PARSE ERROR:", e);
        return res.status(400).json({ ok: false, error: "BAD_INPUT_STRING" });
      }
    }

    // Garante que seja Array real
    arr = Array.from(arr);

    // SecretKey precisa ter 64 bytes
    if (!Array.isArray(arr) || arr.length !== 64) {
      console.log("SECRET LENGTH WRONG:", arr.length);
      return res.status(400).json({ ok: false, error: "INVALID_SECRET_KEY_LENGTH" });
    }

    const secretKey = Uint8Array.from(arr);

    let keypair;
    try {
      keypair = Keypair.fromSecretKey(secretKey);
    } catch (e) {
      console.log("KEYPAIR ERROR:", e.message);
      console.log("SECRET RECEIVED:", arr);
      return res.status(400).json({ ok: false, error: "INVALID_KEYPAIR" });
    }

    // Salva na sessão
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
