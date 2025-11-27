require('dotenv').config();
const { Connection, PublicKey } = require('@solana/web3.js');

const RPC_URL = process.env.RPC_URL;
if (!RPC_URL) throw new Error('RPC_URL not set in .env');

const connection = new Connection(RPC_URL, 'confirmed');

// Token-2022 program ID
const TOKEN_2022_PROGRAM = new PublicKey('TokenzQdHkPbyZdpLz65R7w4CWcPxhQdKzp3rCQuTfC');

// Mint a ler (padrão do .env CUSTOM_MINT)
const MINT = new PublicKey(process.env.CUSTOM_MINT);

async function getToken2022Balance(pubkey) {
  try {
    console.log('🔵 getToken2022Balance() →', pubkey);
    const owner = new PublicKey(pubkey);

    // Usa getParsedTokenAccountsByOwner com programId Token-2022 e filtro por mint
    const accounts = await connection.getParsedTokenAccountsByOwner(owner, {
      programId: TOKEN_2022_PROGRAM,
      mint: MINT,
    });

    if (!accounts.value || accounts.value.length === 0) {
      console.log('⚠️ Token-2022: ATA não encontrada ou sem saldo (0)');
      return {
        mint: MINT.toBase58(),
        amount: 0,
        decimals: 9,
        uiAmount: 0,
        token2022: true
      };
    }

    const info = accounts.value[0].account.data.parsed.info.tokenAmount;
    return {
      mint: MINT.toBase58(),
      amount: Number(info.amount),
      decimals: info.decimals,
      uiAmount: info.uiAmount,
      token2022: true
    };
  } catch (err) {
    console.error('❌ getToken2022Balance error:', err);
    return {
      mint: MINT.toBase58(),
      amount: 0,
      decimals: 9,
      uiAmount: 0,
      token2022: true
    };
  }
}

module.exports = { getToken2022Balance };
