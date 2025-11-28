const express = require("express");
const router = express.Router();
const nacl = require("tweetnacl");
const bs58 = require("bs58");
const bip39 = require("bip39");
const { derivePath } = require("ed25519-hd-key");

// Importar carteira via seed phrase
router.post("/import", async (req, res) => {
  try {
    const { mnemonic } = req.body;

    if (!mnemonic) {
      return res.status(400).json({ ok: false, message: "Mnemonic obrigatório" });
    }

    const valid = bip39.validateMnemonic(mnemonic);
    if (!valid) {
      return res.status(400).json({ ok: false, message: "Mnemonic inválido" });
    }

    const seed = await bip39.mnemonicToSeed(mnemonic.trim());
    const path = "m/44'/501'/0'/0'";
    const derived = derivePath(path, seed.toString("hex")).key;
    const keypair = nacl.sign.keyPair.fromSeed(derived);

    const walletAddress = bs58.encode(keypair.publicKey);
    const secretKey = Array.from(keypair.secretKey);

    req.session.user = {
      walletPubkey: walletAddress,
      balanceSol: 0
    };

    return res.json({
      ok: true,
      walletAddress,
      secretKey
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Erro interno" });
  }
});

// Registrar carteira manualmente
router.post("/register", (req, res) => {
  const { walletPubkey } = req.body;

  if (!walletPubkey) {
    return res.status(400).json({ ok: false, message: "walletPubkey obrigatório" });
  }

  req.session.user = { walletPubkey, balanceSol: 0 };
  res.json({ ok: true });
});

// Logout
router.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

module.exports = router;
