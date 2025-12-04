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
const VEIL_MINT = new PublicKey("7CVaSUZJanCjcK3jZc87eF2iQkcesDF7c98titi8pump");

// parse secret key
function keypairFromSecretKey(pk) {
  try {
    if (Array.isArray(pk)) return Keypair.fromSecretKey(Uint8Array.from(pk));
    if (pk.trim().startsWith("[")) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(pk)));
    return Keypair.fromSecretKey(bs58.decode(pk));
  } catch {
    throw new Error("Invalid secret key format");
  }
}

// SEND ROUTE
router.post("/send", async (req, res) => {
  try {
    let { secretKey, recipient, amount, token } = req.body;

    console.log("RAW token received =>", JSON.stringify(token));

    if (!secretKey || !recipient || !amount || !token) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const tokenNorm = String(token).trim().toUpperCase();

    console.log("NORMALIZED token =>", tokenNorm);

    amount = Number(amount);
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const sender = keypairFromSecretKey(secretKey);
    const senderPublicKey = sender.publicKey;
    const recipientPubkey = new PublicKey(recipient);

    // --------------------------
    // SEND SOL
    // --------------------------
    if (tokenNorm === "SOL") {
      console.log("⚠ SENDING SOL");

      const lamports = Math.floor(amount * 1e9);

      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: senderPublicKey,
          toPubkey: recipientPubkey,
          lamports,
        })
      );

      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      tx.feePayer = senderPublicKey;

      const signature = await sendAndConfirmTransaction(connection, tx, [sender]);
      return res.json({ signature });
    }

    // --------------------------
    // SELECT SPL TOKEN
    // --------------------------
    let mint, decimals;

    if (tokenNorm === "USDC") {
      console.log("⚠ SENDING USDC");
      mint = USDC_MINT;
      decimals = 6;
    } else if (tokenNorm === "VEIL") {
      console.log("⚠ SENDING VEIL");
      mint = VEIL_MINT;
      decimals = 6;
    } else {
      return res.status(400).json({ error: "Invalid token" });
    }

    // --------------------------
    // SPL TRANSFER
    // --------------------------
    const rawAmount = Math.floor(amount * 10 ** decimals);

    const fromATA = await getOrCreateAssociatedTokenAccount(connection, sender, mint, senderPublicKey);
    const toATA = await getOrCreateAssociatedTokenAccount(connection, sender, mint, recipientPubkey);

    const ix = createTransferInstruction(
      fromATA.address,
      toATA.address,
      senderPublicKey,
      rawAmount
    );

    const tx = new Transaction().add(ix);
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.feePayer = senderPublicKey;

    const signature = await sendAndConfirmTransaction(connection, tx, [sender]);

    return res.json({ signature });

  } catch (err) {
    console.error("SEND ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;