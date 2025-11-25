// backend/db.js
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('FATAL: DATABASE_URL not set in env');
  process.exit(1);
}

// For Render / Railway the connection string contains everything (user:pass@host:port/db)
const pool = new Pool({
  connectionString,
  ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false }
});

pool.on('error', (err) => {
  console.error('Unexpected PG error', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
