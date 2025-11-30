const bs58 = require("bs58");
const {
  Connection,
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
  PublicKey,
  clusterApiUrl,
} = require("@solana/web3.js");

// conexão com a solana
const RPC_CLUSTER = "devnet";
const connection = new Connection(clusterApiUrl(RPC_CLUSTER), "confirmed");

// converte secretKey (string/array/base58) para Keypair
function pkToKeypair(pkInput) {
  if (!pkInput) throw new Error("No pk provided");

  // array
  if (Array.isArray(pkInput)) {
    return Keypair.fromSecretKey(Uint8Array.from(pkInput));
  }

  // json array
  try {
    const maybe = JSON.parse(pkInput);
    if (Array.isArray(maybe)) {
      return Keypair.fromSecretKey(Uint8Array.from(maybe));
    }
  } catch (e) {}

  // base58
  try {
    const secret = bs58.decode(pkInput);
    return Keypair.fromSecretKey(secret);
  } catch (e) {
    throw new Error("Invalid private key format");
  }
}

module.exports = {
  async send(req, res) {
    try {
      const { secretKey, senderAddress, recipient, amount } = req.body;

      if (!secretKey || !senderAddress || !recipient || !amount) {
        return res.status(400).json({ error: "Missing fields" });
      }

      const sender = pkToKeypair(secretKey);
      const toPubkey = new PublicKey(recipient);

      const lamports = Math.round(Number(amount) * LAMPORTS_PER_SOL);
      if (isNaN(lamports) || lamports <= 0) {
        throw new Error("Invalid amount");
      }

      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: sender.publicKey,
          toPubkey,
          lamports,
        })
      );

      const signature = await sendAndConfirmTransaction(connection, tx, [sender]);

      return res.json({ signature });
    } catch (error) {
      console.error("SEND ERROR:", error);
      return res.status(500).json({ error: error.message });
    }
  },
};
