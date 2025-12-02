// ========================================================
//  SWAP API - Versão CORRIGIDA para Render
// ========================================================

const express = require("express");
const router = express.Router();
const {
  Connection,
  Keypair,
  VersionedTransaction,
} = require("@solana/web3.js");
const bs58 = require("bs58");

// Configuração
const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// Múltiplos endpoints para Jupiter
const JUPITER_ENDPOINTS = [
  "https://quote-api.jup.ag/v6",
  "https://jupiter-api-v6.fly.dev/v6"
];

// RPCs alternativas
const RPC_ENDPOINTS = [
  "https://api.mainnet-beta.solana.com",
  "https://rpc.ankr.com/solana"
];

// ========================================================
//  Funções auxiliares - CORRIGIDAS
// ========================================================

function parsePrivateKey(secretKey) {
  try {
    if (typeof secretKey === 'string' && secretKey.startsWith("[")) {
      const arr = JSON.parse(secretKey);
      return Keypair.fromSecretKey(new Uint8Array(arr));
    }
    return Keypair.fromSecretKey(bs58.decode(secretKey));
  } catch (err) {
    throw new Error(`Chave inválida: ${err.message}`);
  }
}

// Função fetch simplificada - SEM node-fetch
async function simpleFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const { default: fetch } = require('node-fetch');
    
    // Garantir que options não seja null
    const fetchOptions = options || {};
    
    // Configurar timeout
    const timeout = 15000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(`Timeout após ${timeout}ms`));
    }, timeout);

    fetch(url, { ...fetchOptions, signal: controller.signal })
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

async function tryFetchWithFallback(urls, options = {}) {
  let lastError = null;
  
  for (const url of urls) {
    try {
      console.log(`Tentando: ${url}`);
      
      // Se options for null/undefined, usar objeto vazio
      const fetchOptions = options || {};
      const response = await simpleFetch(url, fetchOptions);
      
      if (response.ok) {
        return response;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      console.warn(`Falha em ${url}: ${error.message}`);
    }
  }
  
  throw lastError || new Error("Todas as URLs falharam");
}

async function getQuoteFromJupiter(inputMint, outputMint, amount, slippageBps = 100) {
  const quoteUrls = JUPITER_ENDPOINTS.map(baseUrl => 
    `${baseUrl}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}&onlyDirectRoutes=false`
  );
  
  // Para GET requests, options deve ser vazio, não null
  const response = await tryFetchWithFallback(quoteUrls, {});
  const data = await response.json();
  
  if (data.error) {
    throw new Error(data.error);
  }
  
  return data;
}

async function getSwapTransactionFromJupiter(quoteData, userPublicKey) {
  const swapUrls = JUPITER_ENDPOINTS.map(baseUrl => `${baseUrl}/swap`);
  const swapBody = {
    quoteResponse: quoteData,
    userPublicKey,
    wrapAndUnwrapSol: true,
    dynamicComputeUnitLimit: true,
    useSharedAccounts: true
  };
  
  // Options para POST request
  const options = {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(swapBody)
  };
  
  const response = await tryFetchWithFallback(swapUrls, options);
  const data = await response.json();
  
  if (data.error) {
    throw new Error(data.error);
  }
  
  return data;
}

async function sendTransactionWithFallback(rawTransaction) {
  let lastError = null;
  
  for (const rpcEndpoint of RPC_ENDPOINTS) {
    try {
      const connection = new Connection(rpcEndpoint, "confirmed");
      const signature = await connection.sendRawTransaction(rawTransaction, {
        skipPreflight: false,
        preflightCommitment: "confirmed",
        maxRetries: 2
      });
      
      console.log(`Transação enviada via ${rpcEndpoint}`);
      return signature;
    } catch (error) {
      lastError = error;
      console.warn(`Falha ao enviar via ${rpcEndpoint}: ${error.message}`);
    }
  }
  
  throw lastError || new Error("Todas as RPCs falharam");
}

// ========================================================
//  Rotas - VERSÃO CORRIGIDA
// ========================================================

router.post("/jupiter", async (req, res) => {
  console.log("=== INICIANDO SWAP ===");
  
  try {
    const { carteiraUsuarioPublica, carteiraUsuarioPrivada, amount, direction } = req.body;
    
    // Validação
    if (!carteiraUsuarioPublica || !carteiraUsuarioPrivada || !amount || !direction) {
      return res.status(400).json({ 
        success: false, 
        error: "Todos os campos são obrigatórios" 
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
    
    // Configuração do swap
    const inputMint = direction === "SOL_TO_USDC" ? SOL_MINT : USDC_MINT;
    const outputMint = direction === "SOL_TO_USDC" ? USDC_MINT : SOL_MINT;
    const amountInSmallestUnits = direction === "SOL_TO_USDC" 
      ? Math.floor(numAmount * 1e9)
      : Math.floor(numAmount * 1e6);
    
    console.log(`Processando swap: ${numAmount} ${direction}`);
    console.log(`Input mint: ${inputMint}`);
    console.log(`Output mint: ${outputMint}`);
    console.log(`Amount em unidades mínimas: ${amountInSmallestUnits}`);
    
    // 1. Obter cotação
    console.log("Obtendo cotação...");
    const quoteData = await getQuoteFromJupiter(
      inputMint, 
      outputMint, 
      amountInSmallestUnits
    );
    
    console.log("Cotação obtida:", {
      inAmount: quoteData.inAmount,
      outAmount: quoteData.outAmount
    });
    
    // 2. Obter transação
    console.log("Obtendo transação...");
    const swapData = await getSwapTransactionFromJupiter(
      quoteData, 
      carteiraUsuarioPublica
    );
    
    if (!swapData.swapTransaction) {
      throw new Error("Transação não gerada pela Jupiter");
    }
    
    console.log("Transação obtida com sucesso");
    
    // 3. Assinar
    console.log("Assinando transação...");
    const userKeypair = parsePrivateKey(carteiraUsuarioPrivada);
    const transactionBuf = Buffer.from(swapData.swapTransaction, "base64");
    const transaction = VersionedTransaction.deserialize(transactionBuf);
    transaction.sign([userKeypair]);
    
    // 4. Enviar
    console.log("Enviando transação...");
    const signature = await sendTransactionWithFallback(transaction.serialize());
    
    console.log("Transação enviada:", signature);
    
    // 5. Responder
    const outputAmount = direction === "USDC_TO_SOL" 
      ? (quoteData.outAmount / 1e9).toFixed(6)
      : (quoteData.outAmount / 1e6).toFixed(2);
    
    const result = {
      success: true,
      signature,
      direction,
      inputAmount: numAmount,
      outputAmount: parseFloat(outputAmount),
      explorerUrl: `https://solscan.io/tx/${signature}`,
      message: "Swap realizado com sucesso!",
      timestamp: new Date().toISOString()
    };
    
    console.log("Swap finalizado com sucesso");
    return res.json(result);
    
  } catch (error) {
    console.error("ERRO NO SWAP:", error.message);
    console.error("Stack trace:", error.stack);
    
    let errorMessage = "Erro ao processar swap";
    
    if (error.message.includes("insufficient funds")) {
      errorMessage = "Saldo insuficiente para realizar o swap";
    } else if (error.message.includes("timeout") || error.message.includes("Timeout")) {
      errorMessage = "Tempo de conexão esgotado. Tente novamente";
    } else if (error.message.includes("ENOTFOUND") || error.message.includes("network")) {
      errorMessage = "Problema de conexão com a rede. Verifique sua internet";
    } else if (error.message.includes("TOKEN_NOT_TRADABLE")) {
      errorMessage = "Token não disponível para trading no momento";
    } else if (error.message.includes("Blockhash")) {
      errorMessage = "Transação expirada. Recarregue e tente novamente";
    }
    
    return res.status(500).json({
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
});

// Rota de saúde simplificada
router.get("/health", async (req, res) => {
  try {
    // Testar conexão com uma RPC
    const connection = new Connection(RPC_ENDPOINTS[0], "confirmed");
    const slot = await connection.getSlot();
    
    res.json({
      status: "online",
      service: "swap-api",
      solanaConnection: "connected",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.json({
      status: "online",
      service: "swap-api",
      solanaConnection: "disconnected",
      warning: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Rota de teste simples
router.get("/test", (req, res) => {
  res.json({
    message: "Swap API está funcionando",
    endpoints: JUPITER_ENDPOINTS,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;