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
// RPC (mainnet)
// -------------------------------------
const RPC_URL =
  process.env.RPC_URL ||
  "https://mainnet.helius-rpc.com/?api-key=1581ae46-832d-4d46-bc0c-007c6269d2d9";

const connection = new Connection(RPC_URL, "confirmed");

// -------------------------------------
// Jupiter endpoints (NÃO USAR mais quote-api.jup.ag)
// -------------------------------------
const JUP_QUOTE_URL = "https://api.jup.ag/quote";
const JUP_SWAP_URL = "https://api.jup.ag/swap";

// -------------------------------------
// Supported Tokens
// -------------------------------------
const SOL_MINT = "So11111111111111111111111111111111111111112"; // Wrapped SOL
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// -------------------------------------
// Key Conversion (base58 or array)
// -------------------------------------
function parseSecretKey(secretKey) {
  if (!secretKey) throw new Error("Missing secretKey.");

  // If array
  if (Array.isArray(secretKey)) {
    return Keypair.fromSecretKey(Uint8Array.from(secretKey));
  }

  // JSON array
  if (typeof secretKey === "string" && secretKey.trim().startsWith("[")) {
    const arr = JSON.parse(secretKey);
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  }

  // Base58
  return Keypair.fromSecretKey(bs58.decode(secretKey));
}

// -------------------------------------
// Transform direction & calculate decimals
// -------------------------------------
function getDirection(dir) {
  const d = (dir || "").toUpperCase();
  if (d === "SOL_TO_USDC") return "SOL_TO_USDC";
  if (d === "USDC_TO_SOL") return "USDC_TO_SOL";
  throw new Error("Invalid direction. Use SOL_TO_USDC or USDC_TO_SOL");
}

function toAtomicAmount(amount, mint) {
  amount = Number(amount);
  if (isNaN(amount) || amount <= 0) throw new Error("Invalid amount.");

  if (mint === SOL_MINT) return Math.floor(amount * 1e9);
  return Math.floor(amount * 1e6); // USDC decimals
}

// -------------------------------------
// MAIN ENDPOINT – Jupiter Swap
// -------------------------------------
router.post("/jupiter", async (req, res) => {
  try {
    const {
      carteiraUsuarioPublica,
      carteiraUsuarioPrivada,
      amount,
      direction,
    } = req.body;

    if (!carteiraUsuarioPublica || !carteiraUsuarioPrivada || !amount || !direction) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    // Validate wallet
    let userPubkey;
    try {
      userPubkey = new PublicKey(carteiraUsuarioPublica);
    } catch {
      return res.status(400).json({ error: "Invalid public wallet address." });
    }

    // private key
    let userKeypair;
    try {
      userKeypair = parseSecretKey(carteiraUsuarioPrivada);
    } catch (err) {
      return res.status(400).json({ error: "Invalid secretKey: " + err.message });
    }

    // Direction
    const dir = getDirection(direction);

    let inputMint, outputMint;
    if (dir === "SOL_TO_USDC") {
      inputMint = SOL_MINT;
      outputMint = USDC_MINT;
    } else {
      inputMint = USDC_MINT;
      outputMint = SOL_MINT;
    }

    const amountAtomic = toAtomicAmount(amount, inputMint);

    // -------------------------------------
    // 1) Jupiter Quote
    // -------------------------------------
    const quoteUrl =
      `${JUP_QUOTE_URL}?inputMint=${inputMint}` +
      `&outputMint=${outputMint}&amount=${amountAtomic}&slippageBps=50`;

    console.log("=== JUPITER QUOTE URL ===");
    console.log(quoteUrl);

    const quoteResp = await fetch(quoteUrl);
    if (!quoteResp.ok) {
      const txt = await quoteResp.text();
      return res.status(502).json({ error: "Failed to fetch quote.", body: txt });
    }

    const quoteJson = await quoteResp.json();

    // validar rota
    if (
      (!quoteJson.routePlan || quoteJson.routePlan.length === 0) &&
      (!quoteJson.data || quoteJson.data.length === 0) &&
      (!quoteJson.routes || quoteJson.routes.length === 0)
    ) {
      return res.status(500).json({ error: "No liquidity route found.", quoteJson });
    }

    // -------------------------------------
    // 2) Build swap transaction
    // -------------------------------------
    const swapResp = await fetch(JUP_SWAP_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        quoteResponse: quoteJson,
        userPublicKey: userPubkey.toBase58(),
        wrapAndUnwrapSol: true,
      }),
    });

    if (!swapResp.ok) {
      const txt = await swapResp.text();
      return res.status(502).json({ error: "Failed to build swap transaction.", body: txt });
    }

    const swapJson = await swapResp.json();

    if (!swapJson.swapTransaction) {
      return res.status(500).json({ error: "Jupiter did not return swapTransaction.", details: swapJson });
    }

    // -------------------------------------
    // 3) Deserialize + sign
    // -------------------------------------
    const txBuffer = Buffer.from(swapJson.swapTransaction, "base64");
    const tx = VersionedTransaction.deserialize(txBuffer);

    tx.sign([userKeypair]);

    // -------------------------------------
    // 4) Send to blockchain
    // -------------------------------------
    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
    });

    await connection.confirmTransaction(signature, "confirmed");

    return res.json({
      success: true,
      signature,
      received: quoteJson.outAmount || null,
    });

  } catch (err) {
    console.error("JUPITER SWAP ERROR:", err);
    return res.status(500).json({
      error: "Erro ao executar swap.",
      details: err.message,
    });
  }
});

// -------------------------------------
module.exports = router;
