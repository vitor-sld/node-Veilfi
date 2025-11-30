// routes/swap.js
const express = require("express");
const router = express.Router();
const { Connection, PublicKey, Keypair, SystemProgram, Transaction } = require("@solana/web3.js");
const bs58 = require("bs58");
const dotenv = require("dotenv");
dotenv.config();

/* ============================================================
   CONFIGURAÇÕES IMPORTANTES
   ============================================================ */

// RPC da Solana
const RPC = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
const connection = new Connection(RPC, "confirmed");

// Treasury (admin)
const TREASURY_PUBKEY = process.env.TREASURY_PUBKEY;
const TREASURY_PRIVATE_KEY = process.env.TREASURY_PRIVATE_KEY;

// Token Mint do Pump.fun
function getMint() {
  const raw = process.env.TOKEN_MINT;
  if (!raw || typeof raw !== "string") throw new Error("TOKEN_MINT is missing");
  return new PublicKey(raw.trim());
}

const MINT = getMint();

/* ============================================================
   VALIDAR E CARREGAR WALLET ADMIN
   ============================================================ */

function getTreasuryWallet() {
  if (!TREASURY_PRIVATE_KEY || typeof TREASURY_PRIVATE_KEY !== "string") {
    throw new Error("Treasure PRIVATE KEY missing");
  }

  try {
    const secret = bs58.decode(TREASURY_PRIVATE_KEY);
    return Keypair.fromSecretKey(secret);
  } catch (err) {
    console.error("Invalid PRIVATE KEY format:", err);
    throw new Error("Invalid PRIVATE KEY format");
  }
}

/* ============================================================
   SWAP: usuário paga SOL → recebe token PUMP.FUN
   ============================================================ */

router.post("/", async (req, res) => {
  try {
    const { amountSol, userWallet } = req.body;

    if (!amountSol || amountSol <= 0) {
      return res.status(400).json({ error: "Invalid amountSol" });
    }

    if (!userWallet || userWallet.length < 20) {
      return res.status(400).json({ error: "Invalid userWallet" });
    }

    const userPubkey = new PublicKey(userWallet);
    const treasury = getTreasuryWallet();

    // Taxa de 2%
    const feePercent = 0.02;
    const fee = amountSol * feePercent;
    const amountAfterFee = amountSol - fee;

    const lamports = Math.floor(amountAfterFee * 1_000_000_000);
    const lamportsFee = Math.floor(fee * 1_000_000_000);

    /* ============================================================
       1 — usuário envia SOL → treasury
       ============================================================ */

    const tx1 = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: userPubkey,
        toPubkey: treasury.publicKey,
        lamports: lamports + lamportsFee,
      })
    );

    const blockhash1 = await connection.getLatestBlockhash();
    tx1.recentBlockhash = blockhash1.blockhash;
    tx1.feePayer = userPubkey;

    const serialized1 = tx1.serialize({ requireAllSignatures: false });
    const base64Tx1 = serialized1.toString("base64");

    /* ============================================================
       2 — treasury envia TOKEN_MINT → user
       ============================================================ */

    const tx2 = new Transaction();

    const tokenProgram = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    const associatedTokenProgram = new PublicKey("ATokenGPv…"); // deixar padrão

    const ataInstruction = require("@solana/spl-token").createAssociatedTokenAccountInstruction(
      treasury.publicKey,
      require("@solana/spl-token").getAssociatedTokenAddressSync(MINT, userPubkey),
      userPubkey,
      MINT
    );

    tx2.add(ataInstruction);

    const sendTokenIx = require("@solana/spl-token").createTransferInstruction(
      require("@solana/spl-token").getAssociatedTokenAddressSync(MINT, treasury.publicKey),
      require("@solana/spl-token").getAssociatedTokenAddressSync(MINT, userPubkey),
      treasury.publicKey,
      lamports // Aqui você define quantos tokens equivalem ao SOL
    );

    tx2.add(sendTokenIx);

    const blockhash2 = await connection.getLatestBlockhash();
    tx2.recentBlockhash = blockhash2.blockhash;
    tx2.feePayer = treasury.publicKey;

    tx2.sign(treasury);

    const serialized2 = tx2.serialize();
    const base64Tx2 = serialized2.toString("base64");

    /* ============================================================
       RETORNO PARA O FRONT
       ============================================================ */

    return res.json({
      success: true,
      message: "Swap initialized",
      sendSolTransaction: base64Tx1, // usuário assina
      sendTokenTransaction: base64Tx2, // backend assina e envia token
      feePercent,
    });

  } catch (error) {
    console.error("SWAP ERROR:", error);
    return res.status(500).json({
      error: error.message || "Swap failed",
    });
  }
});

module.exports = router;
