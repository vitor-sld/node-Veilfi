const express = require("express");
const router = express.Router();
const bs58 = require("bs58");
const {
  Connection,
  Keypair,
  VersionedTransaction,
} = require("@solana/web3.js");

const connection = new Connection("https://api.mainnet-beta.solana.com");

// token fixo
const TOKEN_MINT = "VSKXrgwu5mtbdSZS7Au81p1RgLQupWwYXX1L2cWpump";

router.post("/buy", async (req, res) => {
  try {
    const { secretKey, amountSol } = req.body;

    if (!secretKey || !amountSol) {
      return res.status(400).json({ error: "Missing data" });
    }

    const payer = Keypair.fromSecretKey(Uint8Array.from(secretKey));
    const lamports = Math.floor(Number(amountSol) * 1_000_000_000);

    // 1 — GET QUOTE + TRANSACTION (UMA REQ SÓ)
    const quoteRes = await fetch(
      `https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=${TOKEN_MINT}&amount=${lamports}&slippageBps=100`,
    ).then(r => r.json());

    if (!quoteRes || !quoteRes.outAmount) {
      return res.status(400).json({ error: "No route found" });
    }

    const swapRes = await fetch(
      "https://quote-api.jup.ag/v6/swap",
      {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          quoteResponse: quoteRes,
          userPublicKey: payer.publicKey.toBase58(),
          wrapAndUnwrapSol: true
        })
      }
    ).then(r => r.json());

    if (!swapRes.swapTransaction) {
      return res.status(400).json({ error: "Swap transaction missing" });
    }

    // 2 — EXECUTE TRANSACTION
    const txBuf = Buffer.from(swapRes.swapTransaction, "base64");
    const tx = VersionedTransaction.deserialize(txBuf);
    tx.sign([payer]);

    const sig = await connection.sendRawTransaction(tx.serialize());

    return res.json({ signature: sig });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
