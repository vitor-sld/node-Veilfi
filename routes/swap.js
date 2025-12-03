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

// Normalize a symbol like 'SOL' or 'USDC' to a mint, or validate a mint string.
function normalizeToMint(value) {
  if (!value) return null;
  const v = String(value).trim();
  if (!v) return null;
  const up = v.toUpperCase();
  if (up === 'SOL' || up === 'SOLANA') return SOL_MINT;
  if (up === 'USDC' || up === 'USD' || up === 'USDT') return USDC_MINT;
  // If it already looks like a mint (base58-ish), do a lightweight validation.
  // Solana base58 mints typically range ~32-44 chars. We'll accept 32-64 to be permissive.
  if (/^[1-9A-HJ-NP-Za-km-z]+$/.test(v) && v.length >= 32 && v.length <= 64) return v;
  return null;
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

    // If client sent a `direction` like "SOL_USDC", "SOL->USDC" or "SOL_TO_USDC", parse it
    const direction = req.body.direction || req.body.pair;
    if ((!from || !to) && direction && typeof direction === 'string') {
      // normalize separators to spaces and remove the literal 'TO' token (common pattern)
      const cleaned = direction.replace(/->/g, ' ').replace(/[_-]/g, ' ');
      const parts = cleaned.split(/\s+/).map(s => s.trim()).filter(Boolean).filter(s => s.toUpperCase() !== 'TO');
      if (parts.length >= 2) {
        from = from || parts[0];
        to = to || parts[1];
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

    // Normalize/validate to actual mint addresses
    const inputMint = normalizeToMint(from);
    const outputMint = normalizeToMint(to);

    if (!inputMint || !outputMint) {
      console.error('Invalid mint(s) for quote', { from, to, inputMint, outputMint });
      return res.status(400).json({
        error: 'Parâmetros inválidos',
        details: 'from/to devem ser símbolos válidos (SOL, USDC) ou endereços de mint válidos',
        received: { from, to },
        parsed: { inputMint, outputMint },
      });
    }

    // Convert UI amount to atomic if necessary
    const atomicAmount = (amountInSmallestUnits !== undefined && amountInSmallestUnits !== null)
      ? Number(amountInSmallestUnits)
      : uiAmountToAtomic(Number(amountUi), inputMint);

    const url = `${JUPITER_QUOTE}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${atomicAmount}&slippageBps=50`;

    console.log('Jupiter quote URL:', url);
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
  // ... (Mantenha o código de obtenção de publicKey, privateKey, from, to, amount, etc.)

  // Aceita múltiplos nomes de campo possíveis para compatibilidade com diferentes clientes
  const publicKey = req.body.carteiraUsuarioPublica || req.body.userPublicKey || req.body.publicKey || req.body.wallet;
  const privateKey = req.body.carteiraUsuarioPrivada || req.body.userPrivateKey || req.body.privateKey || req.body.secret; // Necessário para logs, mas NÃO usado para assinar

  // O restante do parsing de `from`, `to`, `amount`, e `quote` é mantido
  
  // ... (Mantenha o código de parsing de `quote` e validação de parâmetros)

  // Se frontend enviou um objeto `quote` completo, aceita-o e extrai mints/amounts
  if (req.body.quote && typeof req.body.quote === 'object') {
   // Lógica para extrair campos do `quote`
   // ... (Mantenha a lógica de extração do quote)
  }

  // ... (Mantenha as verificações de parâmetros ausentes e validação de mints)
  
  // ... (Mantenha a determinação do atomicAmount, que pode ser ignorada se o quote for enviado)

  // Para garantir que temos a cotação correta (se o front-end não enviou o quote completo)
  // Se o front-end enviou o objeto 'quote', use-o. Senão, gere-o:
  let quote = req.body.quote;

  if (!quote) {
   // Se o quote não foi enviado, gere-o (usando inputMint e atomicAmount)
   const inputMint = normalizeToMint(from);
   const outputMint = normalizeToMint(to);
   const atomicAmount = (amountInSmallestUnits !== undefined && amountInSmallestUnits !== null)
    ? Number(amountInSmallestUnits)
    : uiAmountToAtomic(Number(amountUi), inputMint);

   const quoteRes = await axios.get(`${JUPITER_QUOTE}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${atomicAmount}&slippageBps=50`);
   quote = quoteRes.data;
   if (!quote || !quote.outAmount) {
    return res.status(500).json({ error: "Não foi possível obter cotação antes de gerar o swap", details: quote });
   }
  }
  
  // 1) Criar transação de swap via Jupiter
  console.log('Creating swap transaction with Jupiter');
  const swapRes = await axios.post(JUPITER_SWAP, {
   quoteResponse: quote,
   userPublicKey: publicKey,
   wrapAndUnwrapSol: true,
  });
  
  console.log('Jupiter swap response keys:', Object.keys(swapRes.data || {}));
  const swapTxBase64 = swapRes.data?.swapTransaction;

  if (!swapTxBase64) {
   return res.status(500).json({ 
      error: "Swap transaction não gerada", 
    details: swapRes.data // Retorna os detalhes para debug
   });
  }

  // ----------------------------------------------------
  // 🛑 REMOÇÃO: NENHUMA ASSINATURA OU ENVIO NO BACKEND
  // O Front-end fará o restante.
  // ----------------------------------------------------

  // 2) Retornar a transação Base64 (que o Front-end espera)
  return res.json({
   sucesso: true,
   // O campo que o Front-end espera para desserializar e assinar
   swapTransaction: swapTxBase64, 
   from,
   to,
   // Retorna a quantidade de saída esperada para referência
   outAmount: quote.outAmount, 
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

   // Mantenha o status 500 para indicar falha na geração/simulação
   return res.status(500).json(payload);
 }
});

module.exports = router;