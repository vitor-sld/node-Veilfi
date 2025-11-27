const express = require("express");
const router = express.Router();
const bs58 = require("bs58");
const bip39 = require("bip39");
const nacl = require("tweetnacl");
const { Keypair } = require("@solana/web3.js");
const { setUser } = require("../sessionMemory");

router.post("/import", async (req, res) => {
  try {
    const { input } = req.body;
    if (!input) return res.status(400).json({ error: "Missing wallet input" });

    const text = input.trim();
    let keypair;

    // Seed phrase
    if (text.split(" ").length >= 12 && bip39.validateMnemonic(text)) {
      const seed = await bip39.mnemonicToSeed(text);
      const derived = nacl.sign.keyPair.fromSeed(seed.slice(0, 32));
      keypair = Keypair.fromSecretKey(derived.secretKey);
    }

    // Base58
    if (!keypair) {
      try {
        keypair = Keypair.fromSecretKey(bs58.decode(text));
      } catch {}
    }

    // Array
    if (!keypair) {
      try {
        const arr = JSON.parse(text);
        keypair = Keypair.fromSecretKey(Uint8Array.from(arr));
      } catch {}
    }

    if (!keypair) return res.status(400).json({ error: "Invalid wallet data" });

    const pubkey = keypair.publicKey.toBase58();

    setUser({
      id: 1,
      walletPubkey: pubkey,
      keypair: keypair.secretKey
    });

    return res.json({ ok: true, walletPubkey: pubkey });

  } catch (err) {
    console.error("import error:", err);
    return res.status(500).json({ error: "Import failed" });
  }
});

module.exports = router;
