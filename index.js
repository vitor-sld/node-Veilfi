require('dotenv').config();
const express = require('express');
const rateLimit = require('express-rate-limit');
const { pool } = require('./db'); // ensure DB exists
const userRoutes = require('./routes/user');
const activityRoutes = require('./routes/activity');

const app = express();
app.use(express.json());
app.use(rateLimit({ windowMs: 60*1000, max: 200 }));

app.get('/health', (req,res) => res.json({ ok: true }));

app.use('/user', userRoutes);
app.use('/activity', activityRoutes);

const PORT = process.env.PORT || 3001;

// optional: run migrations at startup if env RUN_MIGRATIONS=true
if (process.env.RUN_MIGRATIONS === 'true') {
  console.log('RUN_MIGRATIONS=true -> run migrations via npm run migrate before start');
}

app.listen(PORT, ()=> console.log('Server listening on', PORT));
