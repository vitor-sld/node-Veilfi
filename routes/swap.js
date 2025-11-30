const express = require("express");
const router = express.Router();
const {
  Connection,
  Keypair,
  VersionedTransaction,
} = require("@solana/web3.js");

const RAYDIUM = "https://api-v3.raydium.io";
const connection = new Connection("https://api.mainnet-beta.solana.com");

// TOKEN DO CLIENTE:
const TOKEN_MINT = "VSKXrgwu5mtbdSZS7Au81p1RgLQupWwYXX1L2cWpump";

// SOL (wrapped)
const SOL_MINT = "So11111111111111111111111111111111111111112";

// ================================
// SWAP  →  SOL  →  PUMP TOKEN
// ================================
router.post("/buy", async (req, res) => {
  try {
    const { secretKey, amountSol } = req.body;

    if (!secretKey || !amountSol)
      return res.status(400).json({ error: "Missing data" });

    const user = Keypair.fromSecretKey(Uint8Array.from(secretKey));
    const lamports = Math.floor(Number(amountSol) * 1e9);

    // 1) QUOTE (rota)
    const quoteUrl =
      `${RAYDIUM}/ammV3/quote?inputMint=${SOL_MINT}&outputMint=${TOKEN_MINT}&amount=${lamports}`;

    const quote = await fetch(quoteUrl).then(r => r.json());

    if (!quote?.data) {
      return res.status(400).json({ error: "No route available" });
    }

    // 2) CRIA A TRANSAÇÃO
    const swapTx = await fetch(`${RAYDIUM}/ammV3/swap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        owner: user.publicKey.toBase58(),
        inputMint: SOL_MINT,
        outputMint: TOKEN_MINT,
        amount: lamports,
        slippage: 1, // 1% = seguro
      }),
    }).then(r => r.json());

    if (!swapTx?.data?.swapTransaction) {
      console.log("Raydium error", swapTx);
      return res.status(400).json({ error: "Cannot create swap transaction" });
    }

    // 3) ASSINA & ENVIA
    const txBuf = Buffer.from(swapTx.data.swapTransaction, "base64");
    const tx = VersionedTransaction.deserialize(txBuf);

    tx.sign([user]);

    const sig = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: true,
      maxRetries: 3,
    });

    return res.json({ signature: sig });
  } catch (e) {
    console.error("SWAP ERROR:", e);
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;
