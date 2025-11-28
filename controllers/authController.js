// server/controllers/authController.js
const nacl = require("tweetnacl");
const bs58 = require("bs58");
const { Keypair } = require("@solana/web3.js");
const { createSession } = require("../sessions");

function seedFromMnemonic(mnemonic) {
  const text = mnemonic.trim();
  const encoder = new TextEncoder();
  let hash = encoder.encode(text);
  if (hash.length > 32) hash = hash.slice(0, 32);
  if (hash.length < 32) {
    const padded = new Uint8Array(32);
    padded.set(hash);
    hash = padded;
  }
  return hash;
}

/**
 * POST /auth/import
 * body: { input: string }  -> aceita: seed phrase, base58 private key, JSON array de 64 números
 */
async function importWallet(req, res) {
  const { input } = req.body;
  const isProduction = process.env.NODE_ENV === "production";

  if (!input || typeof input !== "string") {
    return res.status(400).json({ message: "Input inválido (string esperada)." });
  }

  const trimmed = input.trim();

  // 1) seed phrase (12-24 words) -> derive seed32 determinístico
  const words = trimmed.split(/\s+/g);
  try {
    if (words.length >= 12 && words.length <= 24) {
      const seed32 = seedFromMnemonic(trimmed);
      const kp = nacl.sign.keyPair.fromSeed(seed32);
      const keypair = Keypair.fromSecretKey(kp.secretKey);
      const pubkey = keypair.publicKey.toBase58();

      // cria sessão (não armazenamos seed/secret na resposta, mas retornamos secretKey para DEV)
      createSession(pubkey, Array.from(keypair.secretKey), res, isProduction);

      return res.json({
        walletAddress: pubkey,
        secretKey: Array.from(keypair.secretKey),
        type: "mnemonic",
      });
    }
  } catch (e) {
    // continue para próxima tentativa
    console.error("Erro ao processar mnemonic:", e?.message || e);
  }

  // 2) base58 private key
  try {
    const decoded = bs58.decode(trimmed);
    if (decoded.length === 64) {
      const keypair = Keypair.fromSecretKey(decoded);
      const pubkey = keypair.publicKey.toBase58();
      createSession(pubkey, Array.from(keypair.secretKey), res, isProduction);
      return res.json({
        walletAddress: pubkey,
        secretKey: Array.from(keypair.secretKey),
        type: "base58",
      });
    }
  } catch (e) {
    /* ignore decode errors */
  }

  // 3) JSON array 64
  try {
    const arr = JSON.parse(trimmed);
    if (Array.isArray(arr) && arr.length === 64 && arr.every(n => typeof n === "number")) {
      const keypair = Keypair.fromSecretKey(Uint8Array.from(arr));
      const pubkey = keypair.publicKey.toBase58();
      createSession(pubkey, arr, res, isProduction);
      return res.json({
        walletAddress: pubkey,
        secretKey: arr,
        type: "json",
      });
    } else {
      return res.status(400).json({ message: "Entrada inválida. Esperado array JSON com 64 números." });
    }
  } catch (e) {
    return res.status(400).json({ message: "Formato inválido. Use seed phrase, base58 ou JSON array." });
  }
}

module.exports = { importWallet };
