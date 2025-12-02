// ========================================================
//  SWAP API COMPLETA (Corrigido para Render)
// ========================================================

const express = require("express");
const router = express.Router();
const {
  Connection,
  Keypair,
  VersionedTransaction,
} = require("@solana/web3.js");
const bs58 = require("bs58");
const fetch = require("node-fetch"); // Mudança crítica aqui

// Configuração
const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// Lista de RPCs com fallback
const RPC_ENDPOINTS = [
  "https://api.mainnet-beta.solana.com",
  "https://rpc.ankr.com/solana",
  "https://solana-api.projectserum.com"
];

// Lista de endpoints Jupiter
const JUPITER_ENDPOINTS = [
  "https://quote-api.jup.ag/v6",
  "https://jupiter-api-v6.fly.dev/v6"
];

// Timeout helper
const timeout = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Parse da chave privada
function parsePrivateKey(secretKey) {
  try {
    // Se for array JSON (do frontend)
    if (typeof secretKey === 'string' && secretKey.startsWith("[")) {
      const arr = JSON.parse(secretKey);
      return Keypair.fromSecretKey(new Uint8Array(arr));
    }
    // Se for base58
    return Keypair.fromSecretKey(bs58.decode(secretKey));
  } catch (err) {
    console.error("Erro ao parsear chave:", err);
    throw new Error(`Formato de chave inválido: ${err.message}`);
  }
}

// Fetch simplificado
async function simpleFetch(url, options = {}, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Timeout após ${timeoutMs}ms`));
    }, timeoutMs);

    fetch(url, options)
      .then(response => {
        clearTimeout(timeoutId);
        resolve(response);
      })
      .catch(error => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

// Tenta obter quote
async function getJupiterQuote(inputMint, outputMint, amount, slippageBps = 100) {
  for (const baseUrl of JUPITER_ENDPOINTS) {
    try {
      const quoteUrl = `${baseUrl}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}&onlyDirectRoutes=false`;
      
      console.log(`Tentando quote: ${quoteUrl}`);
      
      const response = await simpleFetch(quoteUrl);
      if (!response.ok) continue;
      
      const data = await response.json();
      if (data.error) continue;
      
      if (data.outAmount) {
        console.log(`Quote obtida de ${baseUrl}`);
        return { data, baseUrl };
      }
    } catch (error) {
      console.warn(`Endpoint ${baseUrl} falhou: ${error.message}`);
      continue;
    }
  }
  
  throw new Error("Não foi possível obter quote de nenhum endpoint");
}

// Tenta obter transação de swap
async function getSwapTransaction(quoteData, userPublicKey, baseUrl) {
  const swapBody = {
    quoteResponse: quoteData,
    userPublicKey,
    wrapAndUnwrapSol: true,
    dynamicComputeUnitLimit: true,
    useSharedAccounts: true
  };
  
  for (const endpoint of JUPITER_ENDPOINTS) {
    try {
      const swapUrl = `${endpoint}/swap`;
      console.log(`Tentando swap em: ${swapUrl}`);
      
      const response = await simpleFetch(swapUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(swapBody)
      });
      
      if (!response.ok) continue;
      
      const data = await response.json();
      if (data.error) continue;
      
      if (data.swapTransaction) {
        return data;
      }
    } catch (error) {
      console.warn(`Swap endpoint ${endpoint} falhou: ${error.message}`);
      continue;
    }
  }
  
  throw new Error("Não foi possível obter transação de swap");
}

// ========================================================
//  ROTA PRINCIPAL
// ========================================================

router.post("/jupiter", async (req, res) => {
  console.log("=== SWAP REQUEST ===", {
    wallet: req.body.carteiraUsuarioPublica?.substring(0, 8) + "...",
    direction: req.body.direction,
    amount: req.body.amount
  });
  
  try {
    const { 
      carteiraUsuarioPublica, 
      carteiraUsuarioPrivada, 
      amount, 
      direction 
    } = req.body;
    
    // Validações básicas
    if (!carteiraUsuarioPublica || !carteiraUsuarioPrivada) {
      return res.status(400).json({ 
        success: false,
        error: "Wallet e chave privada são obrigatórios" 
      });
    }
    
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ 
        success: false,
        error: "Amount inválido" 
      });
    }
    
    if (!["SOL_TO_USDC", "USDC_TO_SOL"].includes(direction)) {
      return res.status(400).json({ 
        success: false,
        error: "Direction inválida" 
      });
    }
    
    // Configurar swap
    const inputMint = direction === "SOL_TO_USDC" ? SOL_MINT : USDC_MINT;
    const outputMint = direction === "SOL_TO_USDC" ? USDC_MINT : SOL_MINT;
    const amountInSmallestUnits = direction === "SOL_TO_USDC" 
      ? Math.floor(numAmount * 1e9)
      : Math.floor(numAmount * 1e6);
    
    console.log(`Swap: ${numAmount} ${direction}, unidades: ${amountInSmallestUnits}`);
    
    // 1. Obter quote
    const { data: quoteData, baseUrl } = await getJupiterQuote(
      inputMint,
      outputMint,
      amountInSmallestUnits
    );
    
    // 2. Obter transação
    const swapData = await getSwapTransaction(
      quoteData,
      carteiraUsuarioPublica,
      baseUrl
    );
    
    if (!swapData.swapTransaction) {
      throw new Error("Transação não gerada");
    }
    
    // 3. Assinar
    const userKeypair = parsePrivateKey(carteiraUsuarioPrivada);
    
    const swapTransactionBuf = Buffer.from(swapData.swapTransaction, "base64");
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
    transaction.sign([userKeypair]);
    
    // 4. Enviar (tenta múltiplas RPCs)
    let signature;
    let lastError;
    
    for (const rpcEndpoint of RPC_ENDPOINTS) {
      try {
        const connection = new Connection(rpcEndpoint, "confirmed");
        signature = await connection.sendRawTransaction(
          transaction.serialize(),
          { skipPreflight: false, preflightCommitment: "confirmed" }
        );
        
        console.log(`Transação enviada via ${rpcEndpoint}: ${signature}`);
        break;
      } catch (error) {
        lastError = error;
        console.warn(`RPC ${rpcEndpoint} falhou: ${error.message}`);
        continue;
      }
    }
    
    if (!signature) {
      throw lastError || new Error("Falha ao enviar transação");
    }
    
    // 5. Retornar sucesso
    const result = {
      success: true,
      signature,
      direction,
      inputAmount: numAmount,
      outputAmount: direction === "USDC_TO_SOL" 
        ? (quoteData.outAmount / 1e9).toFixed(6)
        : (quoteData.outAmount / 1e6).toFixed(2),
      explorerUrl: `https://solscan.io/tx/${signature}`,
      message: "Swap realizado!",
      timestamp: new Date().toISOString()
    };
    
    return res.json(result);
    
  } catch (error) {
    console.error("ERRO NO SWAP:", error.message);
    
    let errorMessage = "Erro ao processar swap";
    if (error.message.includes("insufficient funds")) {
      errorMessage = "Saldo insuficiente";
    } else if (error.message.includes("timeout") || error.message.includes("Timeout")) {
      errorMessage = "Tempo esgotado. Tente novamente";
    } else if (error.message.includes("network") || error.message.includes("ENOTFOUND")) {
      errorMessage = "Problema de rede. Verifique sua conexão";
    }
    
    return res.status(500).json({
      success: false,
      error: errorMessage
    });
  }
});

// Health check simplificado
router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "swap-api",
    timestamp: new Date().toISOString(),
    endpoints: JUPITER_ENDPOINTS.length
  });
});

// Rota de teste
router.get("/test", async (req, res) => {
  try {
    // Testa apenas o primeiro endpoint
    const testUrl = `${JUPITER_ENDPOINTS[0]}/quote?inputMint=${SOL_MINT}&outputMint=${USDC_MINT}&amount=1000000&slippageBps=50`;
    const response = await simpleFetch(testUrl, {}, 5000);
    
    res.json({
      status: response.ok ? "online" : "offline",
      endpoint: JUPITER_ENDPOINTS[0],
      ok: response.ok
    });
  } catch (error) {
    res.json({
      status: "error",
      error: error.message,
      endpoint: JUPITER_ENDPOINTS[0]
    });
  }
});

module.exports = router;