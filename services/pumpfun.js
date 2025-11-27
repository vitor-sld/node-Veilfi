require('dotenv').config();
const fetch = require('node-fetch');

async function getPumpBalances(pubkey) {
  const url = `https://pumpportal.fun/api/wallet/${pubkey}/balances`; // best-effort
  console.log('🟪 PumpFun Request →', url);
  try {
    const resp = await fetch(url);
    const data = await resp.json();
    console.log('🟪 PumpFun Tokens:', data.balances?.length || 0);
    return data.balances?.map(b => ({
      mint: b.mint,
      amount: b.balance,
      decimals: b.decimals,
      uiAmount: b.uiAmount,
      pumpfun: true
    })) || [];
  } catch (err) {
    console.error('❌ PumpFun erro:', err);
    return [];
  }
}

module.exports = { getPumpBalances };
