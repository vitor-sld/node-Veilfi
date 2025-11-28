const { Connection, PublicKey, Keypair } = require("@solana/web3.js");
const bs58 = require("bs58");
const env = require("../env");

const connection = new Connection(env.RPC_URL, "confirmed");

const platformKeypair = Keypair.fromSecretKey(bs58.decode(env.SITE_SECRET_KEY));
const platformPubkey = new PublicKey(env.SITE_PUBLIC_KEY);
const tokenMint = new PublicKey(env.TOKEN_MINT);

module.exports = {
  connection,
  platformKeypair,
  platformPubkey,
  tokenMint
};
