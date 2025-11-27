const { Connection, PublicKey } = require("@solana/web3.js");

const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
const connection = new Connection(RPC_URL, "confirmed");

async function getSolanaWalletInfo(pubkey) {
  const publicKey = new PublicKey(pubkey);

  // 1) Balance SOL
  const lamports = await connection.getBalance(publicKey);
  const solBalance = lamports / 1e9;

  // 2) Tokens SPL
  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
    publicKey,
    { programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") }
  );

  const tokens = tokenAccounts.value.map((acc) => ({
    mint: acc.account.data.parsed.info.mint,
    uiAmount: acc.account.data.parsed.info.tokenAmount.uiAmount,
  }));

  return { solBalance, tokens };
}

module.exports = { getSolanaWalletInfo };
