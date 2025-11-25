// backend/routes/user.js
const express = require('express');
const router = express.Router();
const bs58 = require('bs58');
const { query } = require('../db'); // db.query(text, params)
const { encryptSecret } = require('../services/crypto');
const { getBalance, getTokens, withdrawSol, sendSpl } = require('../services/solana');

router.post('/create', async (req, res) => {
  try {
    const { userId, passphrase } = req.body;
    if (!userId || !passphrase) return res.status(400).json({ error: 'missing fields' });

    const kp = require('@solana/web3.js').Keypair.generate();
    const enc = await encryptSecret(kp.secretKey, passphrase);

    const insert = `
      INSERT INTO users (id, pubkey, ciphertext, iv, salt)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO NOTHING
    `;
    await query(insert, [userId, kp.publicKey.toBase58(), enc.ciphertext, enc.iv, enc.salt]);

    res.json({ pubkey: kp.publicKey.toBase58() });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

router.post('/import', async (req, res) => {
  try {
    const { userId, secretBase58, passphrase } = req.body;
    if (!userId || !secretBase58 || !passphrase) return res.status(400).json({ error: 'missing fields' });

    const secret = bs58.decode(secretBase58);
    const enc = await encryptSecret(secret, passphrase);
    const kp = require('@solana/web3.js').Keypair.fromSecretKey(secret);

    await query(
      `INSERT INTO users (id, pubkey, ciphertext, iv, salt) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
      [userId, kp.publicKey.toBase58(), enc.ciphertext, enc.iv, enc.salt]
    );

    res.json({ pubkey: kp.publicKey.toBase58() });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

router.post('/balance', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'missing userId' });

    const r = await query(`SELECT pubkey FROM users WHERE id=$1`, [userId]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'user not found' });

    const pubkey = r.rows[0].pubkey;
    const sol = await getBalance(pubkey);
    const tokens = await getTokens(pubkey);
    res.json({ pubkey, sol, tokens });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

router.post('/withdraw/sol', async (req, res) => {
  try {
    const { userId, to, amountLamports, passphrase } = req.body;
    if (!userId || !to || !amountLamports || !passphrase) return res.status(400).json({ error: 'missing fields' });

    const r = await query(`SELECT ciphertext, iv, salt FROM users WHERE id=$1`, [userId]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'user not found' });

    const { ciphertext, iv, salt } = r.rows[0];

    const sig = await withdrawSol(ciphertext, iv, passphrase, to, amountLamports);

    await query(
      `INSERT INTO activities (user_id, type, token, amount, signature, metadata) VALUES ($1,$2,$3,$4,$5,$6)`,
      [userId, 'withdraw', 'SOL', amountLamports, sig, JSON.stringify({ to })]
    );

    res.json({ signature: sig });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

router.post('/withdraw/spl', async (req, res) => {
  try {
    const { userId, to, mint, amountBaseUnits, passphrase } = req.body;
    if (!userId || !to || !mint || !amountBaseUnits || !passphrase) return res.status(400).json({ error: 'missing fields' });

    const r = await query(`SELECT ciphertext, iv, salt FROM users WHERE id=$1`, [userId]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'user not found' });

    const { ciphertext, iv, salt } = r.rows[0];

    // optionally: check recipient ATA rent and user's SOL balance before calling sendSpl
    const sig = await sendSpl(ciphertext, iv, passphrase, to, mint, amountBaseUnits);

    await query(
      `INSERT INTO activities (user_id, type, token, amount, signature, metadata) VALUES ($1,$2,$3,$4,$5,$6)`,
      [userId, 'withdraw', mint, amountBaseUnits, sig, JSON.stringify({ to })]
    );

    res.json({ signature: sig });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

module.exports = router;
