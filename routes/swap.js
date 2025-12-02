const express = require("express");
const router = express.Router();
const { Connection, Keypair, VersionedTransaction } = require("@solana/web3.js");
const bs58 = require("bs58");
const fetch = require("node-fetch");

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

router.post("/jupiter", async (req, res) => {
  try {
    const { carteiraUsuarioPublica, carteiraUsuarioPrivada, amount, direction } = req.body;
    
    if (!carteiraUsuarioPublica || !carteiraUsuarioPrivada || !amount || !direction) {
      return res.status(400).json({ error: "Dados incompletos" });
    }
    
    // 1. Get quote
    const isSolToUsdc = direction === "SOL_TO_USDC";
    const inputMint = isSolToUsdc ? SOL_MINT : USDC_MINT;
    const outputMint = isSolToUsdc ? USDC_MINT : SOL_MINT;
    const amountInSmallestUnits = isSolToUsdc ? Math.floor(amount * 1e9) : Math.floor(amount * 1e6);
    
    const quoteRes = await fetch(
      `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountInSmallestUnits}&slippageBps=100`
    );
    
    const quoteData = await quoteRes.json();
    if (quoteData.error) throw new Error(quoteData.error);
    
    // 2. Get swap transaction
    const swapRes = await fetch("https://quote-api.jup.ag/v6/swap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteResponse: quoteData,
        userPublicKey: carteiraUsuarioPublica,
        wrapAndUnwrapSol: true
      })
    });
    
    const swapData = await swapRes.json();
    if (swapData.error) throw new Error(swapData.error);
    
    // 3. Sign and send
    const keypair = Keypair.fromSecretKey(bs58.decode(carteiraUsuarioPrivada));
    const transaction = VersionedTransaction.deserialize(
      Buffer.from(swapData.swapTransaction, "base64")
    );
    
    transaction.sign([keypair]);
    
    const connection = new Connection("https://api.mainnet-beta.solana.com");
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed"
    });
    
    res.json({
      success: true,
      signature,
      message: "Swap realizado!"
    });
    
  } catch (error) {
    console.error("Swap error:", error);
    res.status(500).json({
      error: error.message || "Erro no swap"
    });
  }
});

module.exports = router;