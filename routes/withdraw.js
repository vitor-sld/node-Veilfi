const express = require("express");
const router = express.Router();

const crypto = require("crypto");
const {
  Connection,
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  PublicKey,
} = require("@solana/web3.js");

const { TOKEN_PROGRAM_ID } = require("@solana/spl-token");

const pool = require("../db");
const { decryptPrivateKey } = require("../services/solana");

/* -------------------------------------------------------
   🔐 PASSO 1 — Gerar passphrase interna via SERVER_MASTER_KEY
------------------------------------------------------- */
function derivePassphrase(userId) {
  const master = process.env.SERVER_MASTER_KEY;
  if (!master) throw new Error("SERVER_MASTER_KEY missing in .env");

  return crypto.createHmac("sha256", master).update(userId).digest("hex");
}

/* -------------------------------------------------------
   🟣 1) SACAR SOL
------------------------------------------------------- */
router.post("/sol", async (req, res) => {
  try {
    const { userId, destination, amount } = req.body;

    if (!userId || !destination || !amount) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const q = `SELECT ciphertext, iv, salt FROM users WHERE id=$1`;
    const result = await pool.query(q, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const { ciphertext, iv, salt } = result.rows[0];

    const passphrase = derivePassphrase(userId);

    const secretKey = await decryptPrivateKey(ciphertext, iv, salt, passphrase);
    const keypair = Keypair.fromSecretKey(secretKey);

    const connection = new Connection(process.env.RPC_URL, "confirmed");

    const lamports = Math.floor(amount * 1e9);

    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: new PublicKey(destination),
        lamports,
      })
    );

    const signature = await sendAndConfirmTransaction(connection, tx, [keypair]);

    await pool.query(
      `INSERT INTO activities (user_id, type, token, amount, signature, metadata)
       VALUES ($1,'withdraw','SOL',$2,$3,$4)`,
      [userId, lamports, signature, JSON.stringify({ to: destination })]
    );

    res.json({ success: true, signature });
  } catch (err) {
    console.error("Withdraw SOL error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* -------------------------------------------------------
   🟣 2) SACAR SPL — ENSINA-ME A MANDAR USDC/XPUMP
------------------------------------------------------- */
router.post("/spl", async (req, res) => {
  try {
    const { userId, destination, mint, amount } = req.body;

    if (!userId || !destination || !mint || !amount) {
      return res.status(400).json({ error: "Missing SPL fields" });
    }

    const r = await pool.query(
      `SELECT ciphertext, iv, salt FROM users WHERE id=$1`,
      [userId]
    );
    if (r.rows.length === 0)
      return res.status(404).json({ error: "User not found" });

    const { ciphertext, iv, salt } = r.rows[0];

    const passphrase = derivePassphrase(userId);
    const secretKey = await decryptPrivateKey(ciphertext, iv, salt, passphrase);
    const keypair = Keypair.fromSecretKey(secretKey);

    const connection = new Connection(process.env.RPC_URL, "confirmed");

    // IMPORTANTE: Auto-criar ATA
    const { getOrCreateAssociatedTokenAccount, createTransferInstruction } =
      require("@solana/spl-token");

    const senderATA = await getOrCreateAssociatedTokenAccount(
      connection,
      keypair,
      new PublicKey(mint),
      keypair.publicKey
    );

    const destATA = await getOrCreateAssociatedTokenAccount(
      connection,
      keypair,
      new PublicKey(mint),
      new PublicKey(destination),
      true
    );

    const rawAmount = BigInt(Math.floor(amount)); // já deve vir em base units

    const ix = createTransferInstruction(
      senderATA.address,
      destATA.address,
      keypair.publicKey,
      rawAmount,
      [],
      TOKEN_PROGRAM_ID
    );

    const tx = new Transaction().add(ix);

    const sig = await sendAndConfirmTransaction(connection, tx, [keypair]);

    await pool.query(
      `INSERT INTO activities (user_id, type, token, amount, signature, metadata)
       VALUES ($1,'withdraw',$2,$3,$4,$5)`,
      [
        userId,
        mint,
        rawAmount.toString(),
        sig,
        JSON.stringify({ to: destination }),
      ]
    );

    res.json({ success: true, signature: sig });
  } catch (err) {
    console.error("Withdraw SPL error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
