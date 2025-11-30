// server/routes/auth.js
const express = require("express");
const router = express.Router();
const { Keypair } = require("@solana/web3.js");
const bs58 = require("bs58");
const nacl = require("tweetnacl");

const { createSession } = require("../sessions");

/* helper de mnemonic */
function seedFromMnemonic(mnemonic) {
  const enc = new TextEncoder();
  let seed = enc.encode(mnemonic.trim());

  if (seed.length > 32) seed = seed.slice(0, 32);

  if (seed.length < 32) {
    const padded = new Uint8Array(32);
    padded.set(seed);
    seed = padded;
  }
  return seed;
}

/* ==========================================================
   IMPORT WALLET
========================================================== */
router.post("/import", async (req, res) => {
  try {
    const input = req.body?.input?.trim();

    if (!input)
      return res.status(400).json({ error: "No input" });

    let keypair = null;

    /* Try mnemonic (12–24 words) */
    const words = input.split(/\s+/g);
    if (words.length >= 12 && words.length <= 24) {
      const seed = seedFromMnemonic(input);
      const kp = nacl.sign.keyPair.fromSeed(seed);
      keypair = Keypair.fromSecretKey(kp.secretKey);
    }

    /* Try base58 */
    if (!keypair) {
      try {
        const dec = bs58.decode(input);
        if (dec.length === 64) {
          keypair = Keypair.fromSecretKey(dec);
        }
      } catch {}
    }

    /* Try JSON array */
    if (!keypair) {
      try {
        const arr = JSON.parse(input);
        if (Array.isArray(arr) && arr.length === 64) {
          keypair = Keypair.fromSecretKey(Uint8Array.from(arr));
        }
      } catch {}
    }

    if (!keypair) {
      return res.status(400).json({
        error:
          "Invalid wallet format. Expected seed phrase, base58 key or JSON array.",
      });
    }

    /* CREATE SESSION (backend memory session, no DB) */
    createSession(
      keypair.publicKey.toBase58(),
      Array.from(keypair.secretKey),
      res,
      process.env.NODE_ENV === "production"
    );

    /* SEND TO FRONT */
    return res.json({
      walletAddress: keypair.publicKey.toBase58(),
      walletSecret: Array.from(keypair.secretKey), // 🔥 necessário para SEND
    });
  } catch (err) {
    console.error("IMPORT ERROR:", err);
    return res.status(500).json({ error: "IMPORT_FAILED" });
  }
});

module.exports = router;
