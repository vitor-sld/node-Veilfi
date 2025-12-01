// routes/swap.js
// Jupiter-based swap endpoint (SOL <-> USDC, extensível)
// Usage: POST /swap/jupiter
// Body: { carteiraUsuarioPublica, carteiraUsuarioPrivada, amount, direction, slippageBps? }

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

// ---------------------------
// Configuration
// ---------------------------
const RPC_URL =
  process.env.RPC_URL ||
  "https://mainnet.helius-rpc.com/?api-key=1581ae46-832d-4d46-bc0c-007c6269d2d9";

const connection = new Connection(RPC_URL, "confirmed");

// Jupiter endpoints (use api.jup.ag to avoid DNS issues)
const JUP_QUOTE_URL = "https://api.jup.ag/quote";
const JUP_SWAP_URL = "https://api.jup.ag/swap";

// Token mints you want to support
const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// ---------------------------
// Helpers
// ---------------------------
function parseSecretKey(secretKey) {
  // Accept: base58 string, JSON array string, Array<number>
  if (!secretKey) throw new Error("secretKey missing");

  if (Array.isArray(secretKey)) {
    return Keypair.fromSecretKey(Uint8Array.from(secretKey));
  }

  if (typeof secretKey !== "string") {
    throw new Error("secretKey must be base58 string or array");
  }

  // try JSON array
  if (secretKey.trim().startsWith("[")) {
    try {
      const arr = JSON.parse(secretKey);
      if (Array.isArray(arr)) {
        return Keypair.fromSecretKey(Uint8Array.from(arr));
      }
    } catch (e) {
      // fallthrough
    }
  }

  // try base58
  try {
    return Keypair.fromSecretKey(bs58.decode(secretKey));
  } catch (e) {
    throw new Error("Invalid secretKey format");
  }
}

function ensureDirection(direction) {
  // accept a couple possible strings
  const d = String(direction || "").toUpperCase();
  if (d === "SOL_TO_USDC" || d === "SOL->USDC") return "SOL_TO_USDC";
  if (d === "USDC_TO_SOL" || d === "USDC->SOL") return "USDC_TO_SOL";
  throw new Error("Invalid direction");
}

function getAtomicAmount(amount, token) {
  if (token === SOL_MINT) {
    return Math.floor(Number(amount) * 1e9);
  }
  // assume USDC-like (6 decimals) for non-SOL tokens by default
  return Math.floor(Number(amount) * 1e6);
}

// small fetch wrapper with timeout
async function fetchWithTimeout(url, opts = {}, timeout = 10_000) {
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

// ---------------------------
// Jupiter swap endpoint
// ---------------------------
router.post("/jupiter", async (req, res) => {
  try {
    const {
      carteiraUsuarioPublica,
      carteiraUsuarioPrivada,
      amount,
      direction: dirRaw,
      slippageBps: providedSlippage,
    } = req.body;

    if (!carteiraUsuarioPublica || !carteiraUsuarioPrivada || !amount || !dirRaw) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const direction = ensureDirection(dirRaw);

    // Validate public key
    let userPub;
    try {
      userPub = new PublicKey(carteiraUsuarioPublica);
    } catch (e) {
      return res.status(400).json({ error: "Invalid public key" });
    }

    // Construct keypair from secretKey (base58 or array)
    let userKeypair;
    try {
      userKeypair = parseSecretKey(carteiraUsuarioPrivada);
    } catch (e) {
      return res.status(400).json({ error: "Invalid secretKey: " + e.message });
    }

    // Select mints & atomic amount
    let inputMint, outputMint;
    if (direction === "SOL_TO_USDC") {
      inputMint = SOL_MINT;
      outputMint = USDC_MINT;
    } else {
      inputMint = USDC_MINT;
      outputMint = SOL_MINT;
    }

    const amountAtomic = getAtomicAmount(amount, inputMint);

    // slippage config
    const slippageBps = Number(providedSlippage ?? process.env.SLIPPAGE_BPS ?? 50);
    if (isNaN(slippageBps) || slippageBps < 0 || slippageBps > 2000) {
      return res.status(400).json({ error: "Invalid slippageBps" });
    }

    // 1) Request quote from Jupiter
    const quoteUrl = `${JUP_QUOTE_URL}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountAtomic}&slippageBps=${slippageBps}`;
    console.log("=== JUPITER SWAP REQUEST ===");
    console.log("Input Mint:", inputMint);
    console.log("Output Mint:", outputMint);
    console.log("Amount (atomic):", amountAtomic);
    console.log("QUOTE URL:", quoteUrl);

    let quoteResp;
    try {
      quoteResp = await fetchWithTimeout(quoteUrl, { method: "GET" }, 10000);
    } catch (err) {
      console.error("Error fetching quote:", err);
      return res.status(502).json({ error: "Failed to fetch quote from Jupiter", details: err.message || String(err) });
    }

    if (!quoteResp.ok) {
      const text = await quoteResp.text().catch(() => "");
      console.error("Jupiter quote non-200:", quoteResp.status, text);
      return res.status(502).json({ error: "Jupiter quote returned non-200", status: quoteResp.status, body: text });
    }

    const quoteJson = await quoteResp.json();

    // Jupiter shapes responses differently across versions. Try to locate routes/routePlan/etc.
    const hasRoutes = Array.isArray(quoteJson.data) && quoteJson.data.length > 0
      || Array.isArray(quoteJson.routes) && quoteJson.routes.length > 0
      || (quoteJson.routePlan && quoteJson.routePlan.length > 0);

    if (!hasRoutes) {
      console.error("No route from Jupiter quote:", JSON.stringify(quoteJson).slice(0, 1000));
      return res.status(500).json({ error: "No route available", details: quoteJson });
    }

    // 2) Request Jupiter to build swap transaction
    const swapBody = {
      quoteResponse: quoteJson,
      userPublicKey: userPub.toBase58(),
      wrapAndUnwrapSol: true,
    };

    let swapResp;
    try {
      swapResp = await fetchWithTimeout(JUP_SWAP_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(swapBody),
      }, 15000);
    } catch (err) {
      console.error("Error requesting swap tx:", err);
      return res.status(502).json({ error: "Failed to get swap transaction from Jupiter", details: err.message || String(err) });
    }

    if (!swapResp.ok) {
      const text = await swapResp.text().catch(() => "");
      console.error("Jupiter swap non-200:", swapResp.status, text);
      return res.status(502).json({ error: "Jupiter swap endpoint returned non-200", status: swapResp.status, body: text });
    }

    const swapJson = await swapResp.json();

    // swap transaction usually at swapJson.swapTransaction (base64)
    if (!swapJson.swapTransaction) {
      console.error("No swapTransaction in Jupiter response:", JSON.stringify(swapJson).slice(0, 1200));
      return res.status(500).json({ error: "Jupiter did not return a swapTransaction", details: swapJson });
    }

    // 3) Deserialize, sign and send
    try {
      const txBuffer = Buffer.from(swapJson.swapTransaction, "base64");
      const tx = VersionedTransaction.deserialize(txBuffer);

      tx.sign([userKeypair]);

      const raw = tx.serialize();
      const signature = await connection.sendRawTransaction(raw, { skipPreflight: false });

      // Wait confirmation
      await connection.confirmTransaction(signature, "confirmed");

      // Attempt to parse out received amount from quoteJson (best-effort)
      let received = null;
      if (quoteJson && (quoteJson.outAmount || quoteJson.data?.[0]?.outAmount || quoteJson.routes?.[0]?.outAmount)) {
        received = quoteJson.outAmount || quoteJson.data?.[0]?.outAmount || quoteJson.routes?.[0]?.outAmount;
      }

      return res.json({
        success: true,
        signature,
        receivedAmountRaw: received ?? null,
        quote: quoteJson,
        swapResponse: swapJson,
      });
    } catch (err) {
      console.error("Error signing/sending transaction:", err);
      return res.status(500).json({ error: "Failed to sign/send transaction", details: err.message || String(err) });
    }
  } catch (err) {
    console.error("JUPITER ROUTE ERROR:", err);
    return res.status(500).json({ error: err.message || "Unknown error" });
  }
});

module.exports = router;
