const express = require("express");
const router = express.Router();
const bs58 = require("bs58");
const bip39 = require("bip39");
const { Keypair } = require("@solana/web3.js");
const nacl = require("tweetnacl");

const { setUser } = require("../sessionMemory");

router.post("/import", async (req, res) => {
  try {
    const { input } = req.body;

    if (!input || !input.trim()) {
      return res.status(400).json({ error: "Missing wallet input" });
    }

    const text = input.trim();
    let keypair = null;

    // -------------------------------------------------------
    // 1) TRY SEED PHRASE
    // -------------------------------------------------------
    const words = text.split(" ");
    if (words.length >= 12 && bip39.validateMnemonic(text)) {
      const seed = await bip39.mnemonicToSeed(text);
      const derived = nacl.sign.keyPair.fromSeed(seed.slice(0, 32));
      keypair = Keypair.fromSecretKey(Uint8Array.from(derived.secretKey));
    }

    // -------------------------------------------------------
    // 2) TRY BASE58 PRIVATE KEY
    // -------------------------------------------------------
    if (!keypair) {
      try {
        const decoded = bs58.decode(text);
        keypair = Keypair.fromSecretKey(decoded);
      } catch (_) {}
    }

    // -------------------------------------------------------
    // 3) TRY RAW JSON ARRAY
    // -------------------------------------------------------
    if (!keypair) {
      try {
        const arr = JSON.parse(text);
        keypair = Keypair.fromSecretKey(Uint8Array.from(arr));
      } catch (_) {}
    }

    if (!keypair) {
      return res.status(400).json({ error: "Invalid wallet data" });
    }

    const pubkey = keypair.publicKey.toBase58();

    setUser({
      id: 1,
      name: "Imported Wallet",
      walletPubkey: pubkey,
    });

    return res.json({
      ok: true,
      walletPubkey: pubkey,
    });
  } catch (err) {
    console.error("Import error:", err);
    return res.status(500).json({ error: "Import failed" });
  }
});

module.exports = router;
