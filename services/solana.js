// server/services/solana.js
const { Connection, PublicKey } = require("@solana/web3.js");

// configure by env or default public endpoint
const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
const connection = new Connection(RPC_URL, "confirmed");

// get SOL balance (in SOL)
async function getSolBalance(pubkeyString) {
  const pub = new PublicKey(pubkeyString);
  const lamports = await connection.getBalance(pub);
  return lamports / 1e9;
}

// get parsed token accounts (basic)
async function getSplTokens(pubkeyString) {
  const owner = new PublicKey(pubkeyString);
  const resp = await connection.getParsedTokenAccountsByOwner(owner, { programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") });
  const tokens = resp.value.map((v) => {
    const info = v.account.data.parsed.info;
    const mint = info.mint;
    const amount = info.tokenAmount.uiAmount || Number(info.tokenAmount.amount);
    const decimals = info.tokenAmount.decimals;
    return {
      mint,
      amount: Number(info.tokenAmount.amount || 0),
      decimals,
      uiAmount: amount
    };
  });
  return tokens;
}

module.exports = {
  getSolBalance,
  getSplTokens
};
