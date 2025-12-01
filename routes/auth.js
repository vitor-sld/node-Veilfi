// server/routes/auth.js
const express = require("express");
const router = express.Router();
const { Keypair } = require("@solana/web3.js");
const bs58 = require("bs58");

// ===========================================
// IMPORTAR CARTEIRA — ACEITA BASE58 (PHANTOM)
// ===========================================
router.post("/import", async (req, res) => {
  try {
    const { input, name } = req.body;

    if (!input) {
      return res.status(400).json({ ok: false, error: "NO_INPUT" });
    }

    let keypair;

    try {
      const decoded = bs58.decode(input);

      // Se a chave tiver 64 bytes → privateKey real
      if (decoded.length === 64) {
        keypair = Keypair.fromSecretKey(decoded);
      }
      // Phantom mostra uma seed de 32 bytes → expandir para 64
      else if (decoded.length === 32) {
        keypair = Keypair.fromSeed(decoded);
      } else {
        return res.status(400).json({ ok: false, error: "INVALID_KEY_LENGTH" });
      }
    } catch (err) {
      return res.status(400).json({ ok: false, error: "INVALID_BASE58" });
    }

    // Salvar sessão
    req.session.sessionObject = {
      walletPubkey: keypair.publicKey.toBase58(),
      secretKey: Array.from(keypair.secretKey), // ← sempre 64 bytes
      name: name || null,
    };

    req.session.save(() => {
      return res.json({
        ok: true,
        walletPubkey: keypair.publicKey.toBase58(),
        secretKey: Array.from(keypair.secretKey), // opcional enviar ao front
      });
    });

  } catch (err) {
    console.error("AUTH IMPORT ERROR:", err);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

module.exports = router;
