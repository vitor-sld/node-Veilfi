require('dotenv').config();
const fetch = require('node-fetch');

async function getHeliusBalances(pubkey) {
  const API_KEY = process.env.HELIUS_API_KEY;
  if (!API_KEY) {
    console.log('⚠️ Helius key not set, skipping helius call');
    return [];
  }
  const url = `https://api.helius.xyz/v0/addresses/${pubkey}/balances?api-key=${API_KEY}`;
  console.log('🟦 Helius Request →', url);
  try {
    const resp = await fetch(url);
    const data = await resp.json();
    return data.tokens || [];
  } catch (err) {
    console.error('❌ Erro Helius:', err);
    return [];
  }
}

module.exports = { getHeliusBalances };
