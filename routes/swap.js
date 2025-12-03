const express = require("express");
const axios = require("axios");

const router = express.Router();


require("dotenv").config();
const { Connection, Keypair, VersionedTransaction } = require("@solana/web3.js");
const bs58 = require("bs58");


// ================================
// CONFIGURAÇÕES
// ================================
const PORT = process.env.PORT || 3001;
const RPC_ENDPOINT = process.env.RPC_ENDPOINT || "https://api.mainnet-beta.solana.com";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// Use Jupiter public proxy/base which doesn't require API key
const JUP_BASE = process.env.JUP_BASE || "https://public.jupiterapi.com";
const JUPITER_QUOTE = `${JUP_BASE}/quote`;
const JUPITER_SWAP = `${JUP_BASE}/swap`;

// ================================
// HELPER: Converte chave privada
// ================================
function parsePrivateKey(secretKey) {
  try {
    if (secretKey.startsWith("[")) {
      return Keypair.fromSecretKey(new Uint8Array(JSON.parse(secretKey)));
    }
    return Keypair.fromSecretKey(bs58.decode(secretKey));
  } catch (err) {
    throw new Error("Chave privada inválida.");
  }
}

// ================================
// HELPER: converte valor UI → atomic
// ================================
function uiAmountToAtomic(amountUI, mint) {
  if (mint === SOL_MINT) return Math.round(amountUI * 1_000_000_000); // 9 decimais
  if (mint === USDC_MINT) return Math.round(amountUI * 1_000_000); // 6 decimais
  return amountUI;
}

// ================================
// ROTAS
// ================================

// POST /quote
// Body: { from, to, amount } - accepts aliases: `direction` (eg "SOL_USDC" or "SOL->USDC"),
// `inputMint`/`outputMint`, `amountUi`, `amountInSmallestUnits` (atomic)
router.post("/quote", async (req, res) => {
  try {
    // Accept multiple field names for compatibility
    let from = req.body.from || req.body.fromSymbol || req.body.inputMint || req.body.inputMintSymbol;
    let to = req.body.to || req.body.toSymbol || req.body.outputMint || req.body.outputMintSymbol;

    // If client sent a `direction` like "SOL_USDC" or "SOL->USDC", parse it
    const direction = req.body.direction || req.body.pair;
    if ((!from || !to) && direction && typeof direction === 'string') {
      const sep = direction.includes('->') ? '->' : (direction.includes('_') ? '_' : (direction.includes('-') ? '-' : null));
      if (sep) {
        const parts = direction.split(sep).map(s => s.trim());
        if (parts.length === 2) {
          from = from || parts[0];
          to = to || parts[1];
        }
      }
    }

    // Amount alternatives
    const amountUi = req.body.amount ?? req.body.amountUi ?? req.body.usdAmount ?? req.body.solAmount;
    const amountInSmallestUnits = req.body.amountInSmallestUnits ?? req.body.atomicAmount ?? req.body.amountAtomic;

    // Log incoming request keys to help debugging (dev only shows body)
    console.log("QUOTE REQ keys:", Object.keys(req.body));
    if (process.env.NODE_ENV === 'development') {
      const safeBody = { ...req.body };
      if (safeBody.secret) safeBody.secret = '***';
      if (safeBody.privateKey) safeBody.privateKey = '***';
      console.log("QUOTE REQ body:", safeBody);
    }

    if (!from || !to || (amountUi === undefined && amountInSmallestUnits === undefined)) {
      return res.status(400).json({
        error: "Parâmetros inválidos",
        details: "from, to e amount são obrigatórios",
        present: Object.keys(req.body),
      });
    }

    // Normalize symbols like 'SOL' or token mint strings
    const inputMint = (from && from.toUpperCase && from.toUpperCase() === "SOL") ? SOL_MINT : (from || SOL_MINT);
    const outputMint = (to && to.toUpperCase && to.toUpperCase() === "SOL") ? SOL_MINT : (to || USDC_MINT);

    // Convert UI amount to atomic if necessary
    const atomicAmount = (amountInSmallestUnits !== undefined && amountInSmallestUnits !== null)
      ? Number(amountInSmallestUnits)
      : uiAmountToAtomic(Number(amountUi), inputMint);

    const url = `${JUPITER_QUOTE}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${atomicAmount}&slippageBps=50`;

    const { data } = await axios.get(url);

    return res.json(data);
  } catch (err) {
      // Log the full error for debugging
      console.error("QUOTE ERROR:", err);
      const responseData = err.response?.data;
      const baseDetails = responseData || err.message || String(err);

      const payload = {
        error: "Erro ao obter cotação",
        details: baseDetails,
      };
      if (process.env.NODE_ENV === 'development') {
        payload.stack = err.stack;
        payload.config = err.config;
      }

      return res.status(500).json(payload);
  }
});

// POST /swap
// Body: { carteiraUsuarioPublica, carteiraUsuarioPrivada, from: "SOL"|"USDC", to: "SOL"|"USDC", amount: number }
router.post("/swap", async (req, res) => {
  try {
    // Accept multiple possible field names for compatibility with different clients
    const publicKey = req.body.carteiraUsuarioPublica || req.body.userPublicKey || req.body.publicKey || req.body.wallet;
    const privateKey = req.body.carteiraUsuarioPrivada || req.body.userPrivateKey || req.body.privateKey || req.body.secret;
    const from = req.body.from || req.body.fromSymbol || req.body.inputMint || req.body.inputMintSymbol;
    const to = req.body.to || req.body.toSymbol || req.body.outputMint || req.body.outputMintSymbol;
    // Accept amount (UI) or amountInSmallestUnits (atomic)
    const amountUi = req.body.amount ?? req.body.amountUi ?? req.body.usdAmount ?? req.body.solAmount;
    const amountInSmallestUnits = req.body.amountInSmallestUnits ?? req.body.atomicAmount;

    // Mask private key for logs
    const maskedPriv = privateKey ? ("***" + String(privateKey).slice(-8)) : undefined;
    console.log("=== SWAP REQUEST ===", {
      publicKey: publicKey?.toString?.().substring(0, 8) + "...",
      from,
      to,
      amountUi,
      amountInSmallestUnits,
      privateKey: maskedPriv,
      bodyKeys: Object.keys(req.body)
    });

    const missing = [];
    if (!publicKey) missing.push("carteiraUsuarioPublica (or userPublicKey)");
    if (!privateKey) missing.push("carteiraUsuarioPrivada (or userPrivateKey)");
    if (!from) missing.push("from");
    if (!to) missing.push("to");
    if ((amountUi === undefined || amountUi === null || amountUi === "") && (amountInSmallestUnits === undefined || amountInSmallestUnits === null || amountInSmallestUnits === "")) missing.push("amount or amountInSmallestUnits");

    if (missing.length) {
      return res.status(400).json({ error: "Parâmetros ausentes", missing });
    }

    const inputMint = from.toUpperCase() === "SOL" ? SOL_MINT : USDC_MINT;
    const outputMint = to.toUpperCase() === "SOL" ? SOL_MINT : USDC_MINT;
    const atomicAmount = uiAmountToAtomic(Number(amount), inputMint);

    // 1) Obter quote do Jupiter
    const quoteRes = await axios.get(`${JUPITER_QUOTE}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${atomicAmount}&slippageBps=50`);
    const quote = quoteRes.data;

    if (!quote || !quote.outAmount) {
      return res.status(500).json({ error: "Não foi possível obter cotação" });
    }

    // 2) Criar transação de swap
    const swapRes = await axios.post(JUPITER_SWAP, {
      quote,
      userPublicKey: carteiraUsuarioPublica,
      wrapAndUnwrapSol: true,
    });
    const swapTxBase64 = swapRes.data.swapTransaction;

    if (!swapTxBase64) {
      return res.status(500).json({ error: "Swap transaction não gerada" });
    }

    // 3) Assinar transação localmente
    const user = parsePrivateKey(carteiraUsuarioPrivada);
    const txBuf = Buffer.from(swapTxBase64, "base64");
    const tx = VersionedTransaction.deserialize(txBuf);
    tx.sign([user]);

    // 4) Enviar para Solana
    const connection = new Connection(RPC_ENDPOINT, "confirmed");
    const signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
    await connection.confirmTransaction(signature, "confirmed");

    return res.json({
      sucesso: true,
      signature,
      from,
      to,
      amount,
      recebido: quote.outAmount,
    });
  } catch (err) {
      console.error("SWAP ERROR:", err);
      const swapErrData = err.response?.data;
      const baseDetails = swapErrData || err.message || String(err);

      const payload = {
        error: "Erro ao criar transação de swap",
        details: baseDetails,
      };
      if (process.env.NODE_ENV === 'development') {
        payload.stack = err.stack;
        payload.config = err.config;
      }

      return res.status(500).json(payload);
  }
});

module.exports = router;