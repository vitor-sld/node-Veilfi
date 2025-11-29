const express = require("express");
const router = express.Router();
const { Connection, PublicKey, Keypair, SystemProgram, sendAndConfirmTransaction } = require("@solana/web3.js");
const { getOrCreateAssociatedTokenAccount, createTransferInstruction, TOKEN_PROGRAM_ID } = require("@solana/spl-token");
const bs58 = require("bs58");
require("dotenv").config();

// ENV
const RPC = process.env.RPC_URL;
const TOKEN_MINT = process.env.TOKEN_MINT;
const TOKEN_DECIMALS = Number(process.env.TOKEN_DECIMALS);
const SWAP_RATE = Number(process.env.SWAP_RATE);
const TREASURY_PRIVATE_KEY = process.env.TREASURY_PRIVATE_KEY;
const TREASURY_PUBKEY = process.env.TREASURY_PUBKEY;

// SETUP
const connection = new Connection(RPC);
const treasuryKeypair = Keypair.fromSecretKey(bs58.decode(TREASURY_PRIVATE_KEY));
const tokenMintPubkey = new PublicKey(TOKEN_MINT);

// -------------------------
// GET QUOTE
// -------------------------
router.post("/quote", async (req, res) => {
  try {
    const { solAmount } = req.body;

    const tokenAmount = solAmount * SWAP_RATE;

    res.json({
      sol: solAmount,
      token: tokenAmount.toFixed(TOKEN_DECIMALS),
      rate: SWAP_RATE
    });
  } catch (e) {
    res.status(500).json({ error: e.toString() });
  }
});

// -------------------------
// EXECUTE SWAP
// -------------------------
router.post("/execute", async (req, res) => {
  try {
    const { userWallet, solAmount } = req.body;

    if (!userWallet || !solAmount) {
      return res.status(400).json({ error: "Missing parameters." });
    }

    const userPubkey = new PublicKey(userWallet);
    const treasuryPubkey = new PublicKey(TREASURY_PUBKEY);

    // VALOR DO TOKEN A ENVIAR
    const tokenAmount = solAmount * SWAP_RATE;
    const tokenRawAmount = Math.floor(tokenAmount * 10 ** TOKEN_DECIMALS);

    // -------------------------
    // 1. Usuário envia SOL à treasury
    // -------------------------
    const tx1 = new SystemProgram.transfer({
      fromPubkey: userPubkey,
      toPubkey: treasuryPubkey,
      lamports: solAmount * 1e9
    });

    // Usuário deve assinar no frontend. Backend NÃO assina isso.

    // -------------------------
    // 2. Treasury envia tokens ao usuário
    // -------------------------
    const userATA = await getOrCreateAssociatedTokenAccount(
      connection,
      treasuryKeypair,
      tokenMintPubkey,
      userPubkey
    );

    const treasuryATA = await getOrCreateAssociatedTokenAccount(
      connection,
      treasuryKeypair,
      tokenMintPubkey,
      treasuryKeypair.publicKey
    );

    const transferIx = createTransferInstruction(
      treasuryATA.address,
      userATA.address,
      treasuryKeypair.publicKey,
      tokenRawAmount,
      [],
      TOKEN_PROGRAM_ID
    );

    const tx = await sendAndConfirmTransaction(
      connection,
      new Transaction().add(transferIx),
      [treasuryKeypair]
    );

    return res.json({
      success: true,
      signature: tx,
      received: tokenAmount
    });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.toString() });
  }
});

module.exports = router;
