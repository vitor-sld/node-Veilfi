// backend/routes/activity.js
const express = require('express');
const router = express.Router();
const { query } = require('../db');

router.get('/:userId', async (req, res) => {
  try {
    const r = await query(`SELECT id, type, token, amount, signature, metadata, created_at FROM activities WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200`, [req.params.userId]);
    res.json(r.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

module.exports = router;
