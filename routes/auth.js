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

router.post("/import", async (req, res) => {
  try {
    const input = req.body?.input?.trim();
    if (!input) return res.status(400).json({ error: "No input" });

    let keypair = null;

    // TRY 1: Mnemonic
    const words = input.split(/\s+/g);
    if (words.length >= 12 && words.length <= 24) {
      const seed = seedFromMnemonic(input);
      const kp = nacl.sign.keyPair.fromSeed(seed);
      keypair = Keypair.fromSecretKey(kp.secretKey);
    }

    // TRY 2: Base58
    if (!keypair) {
      try {
        const dec = bs58.decode(input);
        if (dec.length === 64) {
          keypair = Keypair.fromSecretKey(dec);
        }
      } catch {}
    }

    // TRY 3: JSON array
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
        error: "Invalid wallet format (mnemonic, base58, or 64-byte array)",
      });
    }

    createSession(
      keypair.publicKey.toBase58(),
      Array.from(keypair.secretKey),
      res,
      process.env.NODE_ENV === "production"
    );

    return res.json({
      walletAddress: keypair.publicKey.toBase58(),
      secretKey: Array.from(keypair.secretKey),
    });
  } catch (err) {
    return res.status(500).json({ error: "IMPORT_FAILED" });
  }
});

module.exports = router;
