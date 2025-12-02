const express = require("express");
const router = express.Router();
const bs58 = require("bs58");

const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} = require("@solana/web3.js");

const {
  getOrCreateAssociatedTokenAccount,
  createTransferInstruction,
} = require("@solana/spl-token");

// RPC
const RPC_URL =
  process.env.RPC_URL ||
  "https://mainnet.helius-rpc.com/?api-key=1581ae46-832d-4d46-bc0c-007c6269d2d9";

const connection = new Connection(RPC_URL, { commitment: "confirmed" });

// MINTS
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

// parse secret key
function keypairFromSecretKey(pk) {
  if (!pk) throw new Error("secretKey missing");

  try {
    // JSON array
    if (pk.trim().startsWith("[")) {
      return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(pk)));
    }

    // base58
    return Keypair.fromSecretKey(bs58.decode(pk));
  } catch (err) {
    throw new Error("Invalid secret key format: " + err.message);
  }
}

// SEND ROUTE
router.post("/send", async (req, res) => {
  try {
    console.log("\n📩 FULL BODY RECEIVED:", req.body);
    console.log("TOKEN typeof:", typeof req.body.token);
    console.log("TOKEN raw:", req.body.token);

    const { secretKey, recipient, amount, token } = req.body;

    if (!secretKey || !recipient || !amount || !token) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const tokenNorm = String(token).trim().toUpperCase();
    console.log("TOKEN normalized:", tokenNorm);

    const sender = keypairFromSecretKey(String(secretKey));
    const senderPublicKey = sender.publicKey;
    const recipientPubkey = new PublicKey(recipient);

    const amt = Number(amount);
    if (isNaN(amt) || amt <= 0)
      return res.status(400).json({ error: "Invalid amount" });

    // --------------------------
    // SEND SOL
    // --------------------------
    if (tokenNorm === "SOL") {
      console.log("🔥 SENDING SOL");

      const lamports = Math.floor(amt * 1e9);

      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: senderPublicKey,
          toPubkey: recipientPubkey,
          lamports,
        })
      );

      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      tx.feePayer = senderPublicKey;

      const signature = await sendAndConfirmTransaction(
        connection,
        tx,
        [sender],
        { skipPreflight: false }
      );

      return res.json({ signature });
    }

    // --------------------------
    // SEND USDC (SPL TOKEN)
    // --------------------------
    if (tokenNorm === "USDC") {
      console.log("💵 SENDING USDC");

      const mint = USDC_MINT;
      const decimals = 6;
      const rawAmount = Math.floor(amt * 10 ** decimals);

      const fromATA = await getOrCreateAssociatedTokenAccount(
        connection,
        sender,
        mint,
        senderPublicKey
      );

      const toATA = await getOrCreateAssociatedTokenAccount(
        connection,
        sender,
        mint,
        recipientPubkey
      );

      const ix = createTransferInstruction(
        fromATA.address,
        toATA.address,
        senderPublicKey,
        rawAmount
      );

      const tx = new Transaction().add(ix);

      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      tx.feePayer = senderPublicKey;

      const signature = await sendAndConfirmTransaction(
        connection,
        tx,
        [sender],
        { skipPreflight: false }
      );

      return res.json({ signature });
    }

    return res.status(400).json({ error: "Invalid token" });
  } catch (err) {
    console.error("SEND ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
