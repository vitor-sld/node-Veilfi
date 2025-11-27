const { Keypair } = require("@solana/web3.js");

const kp = Keypair.generate();

console.log("PUBKEY:", kp.publicKey.toBase58());
console.log("PRIVATE KEY ARRAY:", "[" + kp.secretKey.toString() + "]");
