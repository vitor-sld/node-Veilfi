// server.js
const express = require("express");
const bodyParser = require("body-parser");
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

const app = express();
app.use(bodyParser.json());

// CONFIG
const RPC_CLUSTER = "devnet"; // 'mainnet-beta' em produção (cuidado!)
const connection = new Connection(clusterApiUrl(RPC_CLUSTER), "confirmed");

// helper: converte pk que pode ser base58 string ou array JSON string
function pkToKeypair(pkInput) {
  if (!pkInput) throw new Error("No pk provided");

  // se já for array (objeto)
  if (Array.isArray(pkInput)) {
    return Keypair.fromSecretKey(Uint8Array.from(pkInput));
  }

  // se for string, pode ser JSON array ou base58
  try {
    // tenta parsear JSON array
    const maybeArray = JSON.parse(pkInput);
    if (Array.isArray(maybeArray)) {
      return Keypair.fromSecretKey(Uint8Array.from(maybeArray));
    }
  } catch (e) {
    // não é JSON -> continuar
  }

  // assume base58 string
  try {
    const secret = bs58.decode(pkInput);
    return Keypair.fromSecretKey(secret);
  } catch (e) {
    throw new Error("Invalid private key format (not JSON array nor base58).");
  }
}

app.post("/send", async (req, res) => {
  try {
    const { pk, to, amount } = req.body;
    if (!pk || !to || !amount) {
      return res.status(400).json({ error: "pk, to and amount required" });
    }

    const sender = pkToKeypair(pk);
    const toPub = new PublicKey(to);

    // construir transação de transferência simples
    const lamports = Math.round(Number(amount) * LAMPORTS_PER_SOL);
    if (isNaN(lamports) || lamports <= 0) throw new Error("invalid amount");

    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: sender.publicKey,
        toPubkey: toPub,
        lamports,
      })
    );

    // enviar e confirmar (usa a keypair para assinar)
    const signature = await sendAndConfirmTransaction(connection, tx, [sender]);
    return res.json({ signature });
  } catch (err) {
    console.error("send error:", err);
    return res.status(500).json({ error: err.message || String(err) });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend rodando na porta ${PORT}`));
