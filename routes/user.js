// server/routes/user.js
const express = require("express");
const router = express.Router();
const bs58 = require("bs58");
const { query } = require("../db");
const {
  encryptPrivateKey,
  decryptPrivateKey,
  getBalance,
  getTokens,
  ensureATA,
} = require("../services/solana");
const { Keypair } = require("@solana/web3.js");
const crypto = require("crypto");

/**
 * Deriva passphrase interna baseada no userId + chave mestre
 */
function derivePassphrase(userId) {
  const master = process.env.SERVER_MASTER_KEY;
  if (!master) throw new Error("SERVER_MASTER_KEY missing");
  return crypto.createHmac("sha256", master).update(userId).digest("hex");
}

// Lista de mints suportados (comma-separated) no .env
// Exemplo: SUPPORTED_MINTS=Es9vMFr... ,2J8bP35Xdf...
const SUPPORTED_MINTS = (process.env.SUPPORTED_MINTS || process.env.CUSTOM_MINT || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/* -------------------------------------------------------------
   CREATE USER
------------------------------------------------------------- */
router.post("/create", async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "missing userId" });

    const kp = Keypair.generate();
    const passphrase = derivePassphrase(userId);
    const encrypted = encryptPrivateKey(kp.secretKey, passphrase);

    await query(
      `INSERT INTO users (id, pubkey, ciphertext, iv, salt)
       VALUES ($1,$2,$3,$4,$5)`,
      [userId, kp.publicKey.toBase58(), encrypted.ciphertext, encrypted.iv, encrypted.salt]
    );

    return res.json({ pubkey: kp.publicKey.toBase58() });
  } catch (e) {
    console.error("Create user error:", e);
    return res.status(500).json({ error: String(e) });
  }
});

/* -------------------------------------------------------------
   IMPORT USER
------------------------------------------------------------- */
router.post("/import", async (req, res) => {
  try {
    const { userId, secretBase58 } = req.body;

    if (!userId || !secretBase58) return res.status(400).json({ error: "missing fields" });

    const secret = bs58.decode(secretBase58);
    const kp = Keypair.fromSecretKey(secret);

    const passphrase = derivePassphrase(userId);
    const encrypted = encryptPrivateKey(secret, passphrase);

    await query(
      `INSERT INTO users (id, pubkey, ciphertext, iv, salt)
       VALUES ($1,$2,$3,$4,$5)`,
      [userId, kp.publicKey.toBase58(), encrypted.ciphertext, encrypted.iv, encrypted.salt]
    );

    return res.json({ pubkey: kp.publicKey.toBase58() });
  } catch (e) {
    console.error("Import user error:", e);
    return res.status(500).json({ error: String(e) });
  }
});

/* -------------------------------------------------------------
   BALANCE (com tentativa de criar ATA para mints suportados)
------------------------------------------------------------- */
router.post("/balance", async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "missing fields" });

    const r = await query(`SELECT pubkey, ciphertext, iv, salt FROM users WHERE id=$1`, [userId]);
    if (r.rowCount === 0) return res.status(404).json({ error: "user not found" });

    const { pubkey, ciphertext, iv, salt } = r.rows[0];

    // 1) Ler SOL + tokens
    const sol = await getBalance(pubkey);
    let tokens = await getTokens(pubkey);

    // 2) Se há SUPPORTED_MINTS configuradas, e algum não existe, tenta criar ATA usando a private key do user
    if (SUPPORTED_MINTS.length > 0) {
      // descifra private key para usar como payer
      try {
        const passphrase = derivePassphrase(userId);
        const secretKeyBuf = decryptPrivateKey(ciphertext, iv, salt, passphrase);
        const userKeypair = Keypair.fromSecretKey(secretKeyBuf);

        // Para cada mint suportado, se não estiver no tokens, tenta criar ata
        for (const mint of SUPPORTED_MINTS) {
          const found = tokens.find((t) => t.mint === mint);
          if (!found) {
            try {
              console.log(`Attempting ensureATA for user ${userId} mint ${mint}`);
              await ensureATA(mint, pubkey, userKeypair);
              console.log("ensureATA success", mint);
            } catch (e) {
              console.warn("ensureATA failed for", mint, e.message || e);
              // não quebra toda a rota — apenas registra e continua
            }
          }
        }

        // Recarrega tokens depois de tentar criar ATAs
        tokens = await getTokens(pubkey);
      } catch (e) {
        console.warn("Could not decrypt private key to create ATAs:", e.message || e);
        // apenas continue sem criar ATAs
      }
    }

    return res.json({ pubkey, sol, tokens });
  } catch (e) {
    console.error("Balance error:", e);
    return res.status(500).json({ error: String(e) });
  }
});

module.exports = router;
