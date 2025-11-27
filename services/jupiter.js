// services/jupiter.js
const fetch = global.fetch || require("node-fetch");
const JUP_BASE = process.env.JUP_BASE || "https://public.jupiterapi.com";

/**
 * Get a quote from Jupiter public API v6
 * Input: { fromMint, toMint, amount }  (amount as raw integer in base units or ui? We'll try to accept UI numbers)
 */
async function getQuoteFromJupiter({ fromMint, toMint, amount }) {
  // Jupiter expects amount in integer lamports of the input token.
  // Here we assume the frontend sends `amount` as UI amount (e.g., SOL), so convert if SOL.
  // For production, frontend should send raw amount converted to smallest unit.

  if (!JUP_BASE) throw new Error("JUP_BASE not configured");

  try {
    // Try two approaches: 1) call /quote endpoint (common). If fails, return null.
    // Build URL:
    const url = new URL(`${JUP_BASE}/quote`);
    url.searchParams.set("inputMint", fromMint);
    url.searchParams.set("outputMint", toMint);
    url.searchParams.set("amount", String(amount)); // assume frontend gives proper unit; adjust if necessary
    url.searchParams.set("slippage", "1"); // 1% slippage default

    const res = await fetch(url.toString());
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Jupiter quote failed: ${res.status} ${txt}`);
    }

    const j = await res.json();
    return j;
  } catch (err) {
    console.error("❌ Jupiter quote error:", err);
    return null;
  }
}

/**
 * Build swap payload via Jupiter (if you want server-side tx building)
 * Not implemented fully — placeholder.
 */
async function buildSwapPayload(quote) {
  // In real flow, you call Jupiter's `/swap` endpoint with the route and user key to get a transaction to sign.
  return { message: "not implemented server-side", quote };
}

module.exports = { getQuoteFromJupiter, buildSwapPayload };
