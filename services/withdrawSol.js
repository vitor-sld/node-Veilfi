import dotenv from "dotenv";
dotenv.config();

import {
  Connection,
  PublicKey,
  SystemProgram,
  Keypair,
  LAMPORTS_PER_SOL,
  Transaction,
} from "@solana/web3.js";

// -------------------------------
// CONFIG
// -------------------------------
const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";

const connection = new Connection(RPC_URL, "confirmed");
const SECRET = JSON.parse(process.env.SECRET_KEY);
const companyWallet = Keypair.fromSecretKey(Uint8Array.from(SECRET));

// -------------------------------
// WITHDRAW SOL
// -------------------------------
export async function withdrawSol(req, res) {
  try {
    const { to, amount } = req.body;

    if (!to || !amount) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    const toPubkey = new PublicKey(to);
    const lamportsToSend = Math.floor(amount * LAMPORTS_PER_SOL);

    // 1. Cria instrucao
    const ix = SystemProgram.transfer({
      fromPubkey: companyWallet.publicKey,
      toPubkey,
      lamports: lamportsToSend,
    });

    // 2. Transação
    const tx = new Transaction().add(ix);

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash("finalized");

    tx.recentBlockhash = blockhash;
    tx.feePayer = companyWallet.publicKey;

    // 3. Envia
    const signature = await connection.sendTransaction(tx, [companyWallet]);

    // 4. Confirma
    await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "finalized"
    );

    return res.json({
      success: true,
      signature,
      explorer: `https://explorer.solana.com/tx/${signature}?cluster=mainnet`,
    });
  } catch (error) {
    console.error("❌ Withdraw error:", error);
    return res.status(500).json({ error: error.message });
  }
}
