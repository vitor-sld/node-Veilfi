// backend/run_migrations.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function run() {
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'migrations', 'create_tables.sql'), 'utf8');
    await pool.query(sql);
    console.log('Migrations executed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

run();
