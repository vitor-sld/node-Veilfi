const express = require("express");
const router = express.Router();
const {
  Connection,
  Keypair,
  VersionedTransaction,
} = require("@solana/web3.js");

const connection = new Connection("https://api.mainnet-beta.solana.com");

// Seu token pump:
const TOKEN_MINT = "VSKXrgwu5mtbdSZS7Au81p1RgLQupWwYXX1L2cWpump";

// Lite endpoint:
const LITE_SWAP_URL = "https://lite-api.jup.ag/swap/v1/swap";

router.post("/buy", async (req, res) => {
  try {
    const { secretKey, amountSol } = req.body;

    if (!secretKey || !amountSol)
      return res.status(400).json({ error: "Missing data" });

    const payer = Keypair.fromSecretKey(Uint8Array.from(secretKey));
    const lamports = Math.floor(Number(amountSol) * 1e9);

    // Faz tudo em UMA requisição:
    const swapRes = await fetch(LITE_SWAP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inputMint: "So11111111111111111111111111111111111111112",
        outputMint: TOKEN_MINT,
        amount: lamports,
        slippageBps: 300,
        userPublicKey: payer.publicKey.toBase58(),
      }),
    }).then((r) => r.json());

    if (!swapRes.swapTransaction) {
      console.log("JUP SWAP ERROR:", swapRes);
      return res.status(400).json({ error: "No swap transaction returned" });
    }

    // Assinar e enviar
    const txBuf = Buffer.from(swapRes.swapTransaction, "base64");
    const tx = VersionedTransaction.deserialize(txBuf);
    tx.sign([payer]);

    const sig = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: true,
      maxRetries: 3,
    });

    return res.json({ signature: sig });
  } catch (err) {
    console.error("LITE SWAP ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
