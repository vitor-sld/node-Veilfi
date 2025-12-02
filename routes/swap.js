// swap.js – Jupiter v6 – SOL <-> USDC
// -------------------------------------

const express = require("express");
const router = express.Router();
const fetch = require("node-fetch");
const bs58 = require("bs58");

const {
  Connection,
  PublicKey,
  Keypair,
  VersionedTransaction,
} = require("@solana/web3.js");

// -------------------------------------
// ENV + RPC
// -------------------------------------
const RPC_URL =
  process.env.RPC_URL ||
  "https://mainnet.helius-rpc.com/?api-key=1581ae46-832d-4d46-bc0c-007c6269d2d9";

const JUP_API_KEY = process.env.JUP_API_KEY;

if (!JUP_API_KEY) {
  console.error("❌ FALTA JUP_API_KEY no Render Environment!");
}

const connection = new Connection(RPC_URL, "confirmed");

// -------------------------------------
// Jupiter endpoints
// -------------------------------------
const JUP_QUOTE_URL = "https://api.jup.ag/quote";
const JUP_SWAP_URL = "https://api.jup.ag/swap";

// -------------------------------------
// Mints
// -------------------------------------
const SOL_MINT = "So11111111111111111111111111111111111111112"; // WSOL
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G3ky6a9qZ7bL92"; // mainnet USDC

// -------------------------------------
// Convert secret key (array, json ou base58)
// -------------------------------------
function parseSecretKey(secretKey) {
  if (!secretKey) throw new Error("Missing secretKey.");

  if (Array.isArray(secretKey))
    return Keypair.fromSecretKey(Uint8Array.from(secretKey));

  if (secretKey.trim().startsWith("[")) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secretKey)));
  }

  return Keypair.fromSecretKey(bs58.decode(secretKey));
}

// -------------------------------------
// Main swap route
// -------------------------------------
router.post("/jupiter", async (req, res) => {
  try {
    const { carteiraUsuarioPublica, carteiraUsuarioPrivada, amount, direction } =
      req.body;

    if (!carteiraUsuarioPublica || !carteiraUsuarioPrivada || !amount || !direction) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const userPubkey = new PublicKey(carteiraUsuarioPublica);
    const userKeypair = parseSecretKey(carteiraUsuarioPrivada);

    // ----------------------------------
    // SELECT MINTS
    // ----------------------------------
    let inputMint, outputMint, atomicAmount;

    if (direction === "SOL_TO_USDC") {
      inputMint = SOL_MINT;
      outputMint = USDC_MINT;
      atomicAmount = Math.floor(Number(amount) * 1e9);
    } else if (direction === "USDC_TO_SOL") {
      inputMint = USDC_MINT;
      outputMint = SOL_MINT;
      atomicAmount = Math.floor(Number(amount) * 1e6);
    } else {
      return res.status(400).json({ error: "Invalid direction" });
    }

    // ----------------------------------
    // 1) GET QUOTE
    // ----------------------------------
    const quoteUrl =
      `${JUP_QUOTE_URL}?inputMint=${inputMint}` +
      `&outputMint=${outputMint}&amount=${atomicAmount}&slippageBps=50`;

    const quoteResp = await fetch(quoteUrl, {
      headers: {
        "JUPITER-API-KEY": JUP_API_KEY,
      },
    });

    if (!quoteResp.ok) {
      return res.status(400).json({
        error: "Jupiter quote failed",
        status: quoteResp.status,
        body: await quoteResp.text(),
      });
    }

    const quoteJson = await quoteResp.json();

    if (!quoteJson || !quoteJson.routePlan) {
      return res.status(400).json({ error: "No route found" });
    }

    // ----------------------------------
    // 2) BUILD SWAP TRANSACTION
    // ----------------------------------
    const swapResp = await fetch(JUP_SWAP_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "JUPITER-API-KEY": JUP_API_KEY,
      },
      body: JSON.stringify({
        quoteResponse: quoteJson,
        userPublicKey: userPubkey.toBase58(),
        wrapAndUnwrapSol: true,
      }),
    });

    if (!swapResp.ok) {
      return res.status(400).json({
        error: "Failed to build swap transaction",
        status: swapResp.status,
        body: await swapResp.text(),
      });
    }

    const swapJson = await swapResp.json();

    if (!swapJson.swapTransaction) {
      return res.status(400).json({ error: "Missing transaction", details: swapJson });
    }

    // ----------------------------------
    // 3) SIGN TRANSACTION
    // ----------------------------------
    const txBuffer = Buffer.from(swapJson.swapTransaction, "base64");
    const tx = VersionedTransaction.deserialize(txBuffer);
    tx.sign([userKeypair]);

    // ----------------------------------
    // 4) SEND TO BLOCKCHAIN
    // ----------------------------------
    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
    });

    await connection.confirmTransaction(signature, "confirmed");

    return res.json({
      success: true,
      signature,
      receivedAmount: quoteJson.outAmount,
    });
  } catch (err) {
    console.error("SWAP ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
