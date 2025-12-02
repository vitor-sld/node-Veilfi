// routes/swap-jupiter.js
// Jupiter v6 swap endpoint (SOL <-> USDC)
// Usage: POST /swap/jupiter
// Body: { carteiraUsuarioPublica, carteiraUsuarioPrivada, amount, direction }
// direction: "SOL_TO_USDC" | "USDC_TO_SOL"
// amount: decimal number (e.g. 0.5) — NOT atomic units (backend converts)

const express = require("express");
const router = express.Router();
const bs58 = require("bs58");

// dynamic import fetch to avoid conflicts with environments where fetch exists
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));

const {
  Connection,
  PublicKey,
  Keypair,
  VersionedTransaction,
} = require("@solana/web3.js");

// ------------------------- config -------------------------
const RPC_URL =
  process.env.RPC_URL ||
  "https://mainnet.helius-rpc.com/?api-key=1581ae46-832d-4d46-bc0c-007c6269d2d9";

// prefer "confirmed" commitment
const connection = new Connection(RPC_URL, "confirmed");

// Jupiter endpoints (api.jup.ag v6)
const JUP_QUOTE_URL = "https://api.jup.ag/quote";
const JUP_SWAP_URL = "https://api.jup.ag/swap";

// mints
const SOL_MINT = "So11111111111111111111111111111111111111112"; // WSOL
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // USDC

// ------------------------- helpers -------------------------
function parseSecretKey(secretKey) {
  if (!secretKey) throw new Error("Missing secretKey");
  if (Array.isArray(secretKey)) return Keypair.fromSecretKey(Uint8Array.from(secretKey));
  if (typeof secretKey === "string" && secretKey.trim().startsWith("[")) {
    const arr = JSON.parse(secretKey);
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  }
  return Keypair.fromSecretKey(bs58.decode(secretKey));
}

function ensureDirection(dir) {
  if (!dir) throw new Error("Missing direction");
  const d = String(dir).toUpperCase();
  if (d === "SOL_TO_USDC" || d === "USDC_TO_SOL") return d;
  throw new Error("Invalid direction. Use SOL_TO_USDC or USDC_TO_SOL");
}

function toAtomic(amount, mint) {
  amount = Number(amount);
  if (isNaN(amount) || amount <= 0) throw new Error("Invalid amount");
  if (mint === SOL_MINT) return Math.floor(amount * 1e9); // lamports
  return Math.floor(amount * 1e6); // USDC 6 decimals
}

// small helper to timeout fetchs
async function fetchWithTimeout(url, opts = {}, timeout = 15000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

// ------------------------- main route -------------------------
router.post("/jupiter", async (req, res) => {
  try {
    const { carteiraUsuarioPublica, carteiraUsuarioPrivada, amount, direction } = req.body;

    if (!carteiraUsuarioPublica || !carteiraUsuarioPrivada || !amount || !direction) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // validate and parse
    let userPub;
    try {
      userPub = new PublicKey(carteiraUsuarioPublica);
    } catch {
      return res.status(400).json({ error: "Invalid public key" });
    }

    let userKeypair;
    try {
      userKeypair = parseSecretKey(carteiraUsuarioPrivada);
    } catch (err) {
      return res.status(400).json({ error: "Invalid secretKey: " + err.message });
    }

    const dir = ensureDirection(direction);
    const inputMint = dir === "SOL_TO_USDC" ? SOL_MINT : USDC_MINT;
    const outputMint = dir === "SOL_TO_USDC" ? USDC_MINT : SOL_MINT;

    // convert to atomic (lamports / token smallest unit)
    const amountAtomic = toAtomic(amount, inputMint);

    // 1) request quote (api.jup.ag)
    const quoteUrl = `${JUP_QUOTE_URL}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountAtomic}&slippageBps=50`;
    const quoteResp = await fetchWithTimeout(quoteUrl, {}, 10000);
    if (!quoteResp.ok) {
      const body = await quoteResp.text().catch(() => "");
      return res.status(502).json({ error: "Jupiter quote failed", status: quoteResp.status, body });
    }
    const quoteJson = await quoteResp.json();

    // normalize quote shape (v6 returns data array)
    const route = Array.isArray(quoteJson.data) && quoteJson.data.length > 0 ? quoteJson.data[0] : null;
    if (!route) {
      return res.status(500).json({ error: "No route found", quoteJson });
    }

    // 2) request swap transaction from Jupiter swap endpoint
    const swapPayload = {
      quoteResponse: route,
      userPublicKey: userPub.toBase58(),
      wrapAndUnwrapSol: true,
    };

    const swapResp = await fetchWithTimeout(JUP_SWAP_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(swapPayload),
    }, 20000);

    if (!swapResp.ok) {
      const body = await swapResp.text().catch(() => "");
      return res.status(502).json({ error: "Jupiter swap build failed", status: swapResp.status, body });
    }

    const swapJson = await swapResp.json();

    if (!swapJson.swapTransaction) {
      return res.status(500).json({ error: "No swapTransaction returned", swapJson });
    }

    // 3) deserialize, sign and send
    const txBuffer = Buffer.from(swapJson.swapTransaction, "base64");
    const tx = VersionedTransaction.deserialize(txBuffer);
    tx.sign([userKeypair]);

    const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
    await connection.confirmTransaction(sig, "confirmed");

    return res.json({ success: true, signature: sig, quote: route, swapResponse: swapJson });
  } catch (err) {
    console.error("JUPITER SWAP ERROR:", err);
    return res.status(500).json({ error: err.message || "Unknown error" });
  }
});

module.exports = router;
