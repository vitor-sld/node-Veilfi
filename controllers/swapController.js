// server/controllers/swapController.js
// Controlador para endpoints /swap
// Usa global fetch (Node v18+ / v22) e variáveis de ambiente para fallback.

const { randomUUID } = require("crypto");

const inMemoryOrders = {}; // temporário - substitua por DB em produção

const TOKEN_MINT = process.env.TOKEN_MINT || "VSKXrgwu5mtbdSZS7Au81p1RgLQupWwYXX1L2cWpump";
const TOKEN_NAME = process.env.TOKEN_NAME || "PUMP";
const FALLBACK_PRICE_SOL = parseFloat(process.env.FALLBACK_PRICE_SOL || "0.0");
const FALLBACK_PRICE_USD = parseFloat(process.env.FALLBACK_PRICE_USD || "0.0");
const MERCHANT_PUBKEY = process.env.MERCHANT_PUBKEY || "MERCHANT_PUBLIC_KEY_PLACEHOLDER";

// Try a few known pump endpoints. If all fail, return fallback.
async function fetchPumpPrice(mint) {
  const tries = [
    `https://frontend-api.pump.fun/api/v2/tokens/${mint}`,
    `https://pump.fun/api/v2/tokens/${mint}`,
    `https://pump.fun/v1/tokens/${mint}`,
  ];

  for (const url of tries) {
    try {
      const res = await fetch(url, { method: "GET", headers: { "User-Agent": "Veilfi/1.0" }, redirect: "follow" });
      if (!res.ok) {
        // continue to next
        continue;
      }
      const json = await res.json().catch(() => null);
      if (!json) continue;

      // normalize fields (pump API variants)
      // expected shape: { priceSol, priceUsd } or nested
      // try common keys
      const priceSol = json.priceSol ?? json.data?.priceSol ?? json.price?.sol ?? null;
      const priceUsd = json.priceUsd ?? json.data?.priceUsd ?? json.price?.usd ?? null;

      // some pump endpoints return complex structures; try to extract last trade price
      const derivedSol = priceSol ?? (json?.meta?.priceSol) ?? null;
      const derivedUsd = priceUsd ?? (json?.meta?.priceUsd) ?? null;

      if (derivedSol != null || derivedUsd != null) {
        return {
          priceSol: Number(derivedSol ?? FALLBACK_PRICE_SOL),
          priceUsd: Number(derivedUsd ?? FALLBACK_PRICE_USD),
          meta: json,
        };
      }

      // if json contains listings or trades, attempt minimal extraction
      if (json?.market_price) {
        return {
          priceSol: Number(json.market_price.sol ?? FALLBACK_PRICE_SOL),
          priceUsd: Number(json.market_price.usd ?? FALLBACK_PRICE_USD),
          meta: json,
        };
      }

      // otherwise return the raw json as meta and let fallback be used
      return { priceSol: FALLBACK_PRICE_SOL, priceUsd: FALLBACK_PRICE_USD, meta: json };
    } catch (err) {
      // ignore and try next
      continue;
    }
  }

  // all fails -> fallback
  return { priceSol: FALLBACK_PRICE_SOL, priceUsd: FALLBACK_PRICE_USD, meta: { note: "fallback used" } };
}

exports.getPrice = async (req, res) => {
  try {
    const data = await fetchPumpPrice(TOKEN_MINT);
    // attach token info
    data.tokenMint = TOKEN_MINT;
    data.tokenName = TOKEN_NAME;
    return res.json({
      priceSol: Number(data.priceSol || 0),
      priceUsd: Number(data.priceUsd || 0),
      meta: { mint: TOKEN_MINT, tokenName: TOKEN_NAME, sourceMeta: data.meta },
    });
  } catch (err) {
    console.error("price error", err);
    return res.json({
      priceSol: FALLBACK_PRICE_SOL,
      priceUsd: FALLBACK_PRICE_USD,
      meta: { mint: TOKEN_MINT, tokenName: TOKEN_NAME, error: String(err) },
    });
  }
};

/**
 * Prepare buy:
 * Body: { payerPubkey, buyWith: "SOL"|"USDT", amount: number }
 * Behavior: create an order (in memory) and return fallback params:
 *   { mode: "param_fallback", params: { recipient: MERCHANT_PUBKEY, buyWith } , orderId }
 *
 * Frontend can then transfer SOL/USDT to recipient. This keeps server
 * as intermediary (merchant) — server later confirms order and credits tokens.
 */
exports.prepareBuy = async (req, res) => {
  try {
    const { payerPubkey, buyWith, amount } = req.body ?? {};
    if (!payerPubkey || !buyWith || !amount) {
      return res.status(400).json({ ok: false, error: "MISSING_PARAMS" });
    }

    const orderId = randomUUID();
    inMemoryOrders[orderId] = {
      id: orderId,
      type: "buy",
      payerPubkey,
      buyWith,
      amount,
      status: "pending",
      createdAt: Date.now(),
    };

    // Response that matches the frontend fallback handling:
    return res.json({
      ok: true,
      mode: "param_fallback",
      orderId,
      params: {
        recipient: MERCHANT_PUBKEY,
        buyWith,
        token: TOKEN_NAME,
      },
    });
  } catch (err) {
    console.error("/swap/prepare/buy error", err);
    return res.status(500).json({ ok: false, error: "PREPARE_BUY_FAILED", details: String(err) });
  }
};

/**
 * Prepare sell:
 * Body: { sellerPubkey, sellWith: "SOL"|"USDT", amountTokens }
 * This example returns param_fallback: server will provide the recipient (merchant)
 * where user should send the tokens (SPL transfer) or SOL received.
 */
exports.prepareSell = async (req, res) => {
  try {
    const { sellerPubkey, sellWith, amountTokens } = req.body ?? {};
    if (!sellerPubkey || !sellWith || !amountTokens) {
      return res.status(400).json({ ok: false, error: "MISSING_PARAMS" });
    }

    const orderId = randomUUID();
    inMemoryOrders[orderId] = {
      id: orderId,
      type: "sell",
      sellerPubkey,
      sellWith,
      amountTokens,
      status: "pending",
      createdAt: Date.now(),
    };

    return res.json({
      ok: true,
      mode: "param_fallback",
      orderId,
      params: {
        recipient: MERCHANT_PUBKEY,
        sellWith,
        token: TOKEN_NAME,
      },
    });
  } catch (err) {
    console.error("/swap/prepare/sell error", err);
    return res.status(500).json({ ok: false, error: "PREPARE_SELL_FAILED", details: String(err) });
  }
};

/**
 * Optional helpers for testing: list orders and order status.
 */
exports.listOrders = (req, res) => {
  return res.json({ ok: true, orders: Object.values(inMemoryOrders) });
};

exports.getOrder = (req, res) => {
  const { id } = req.params;
  const o = inMemoryOrders[id];
  if (!o) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
  return res.json({ ok: true, order: o });
};

/**
 * Jupiter Quote Endpoint
 * Body: { inputMint, outputMint, amount, slippageBps, userPublicKey }
 * Necessita: process.env.JUPITER_API_KEY
 */
exports.getQuote = async (req, res) => {
  try {
    const { inputMint, outputMint, amount, slippageBps, userPublicKey } = req.body ?? {};

    if (!inputMint || !outputMint || !amount || !userPublicKey) {
      return res.status(400).json({ error: "Parâmetros faltando" });
    }

    const API_KEY = process.env.JUPITER_API_KEY;
    if (!API_KEY) {
      return res.status(500).json({ error: "API KEY da Jupiter não configurada" });
    }

    const url = `https://api.jup.ag/v6/quote?${new URLSearchParams({
      inputMint,
      outputMint,
      amount: String(amount),
      slippageBps: String(slippageBps || 50),
      onlyDirectRoutes: "false",
    }).toString()}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-API-KEY": API_KEY,
        "User-Agent": "Veilfi/Backend",
      },
    });

    if (!response.ok) {
      const err = await response.text().catch(() => "Unknown error");
      return res.status(response.status).json({
        error: "Erro ao obter cotação",
        details: err,
      });
    }

    const data = await response.json();
    return res.json(data);

  } catch (err) {
    console.error("Erro /swap/quote:", err);
    return res.status(500).json({
      error: "Erro ao obter cotação",
      details: String(err),
    });
  }
};
