// ========================================================
//  SWAP API - Versão otimizada para Render
// ========================================================

const express = require("express");
const router = express.Router();
const {
  Connection,
  Keypair,
  VersionedTransaction,
} = require("@solana/web3.js");
const bs58 = require("bs58");
const fetch = require("node-fetch");

// Configuração
const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// Múltiplos endpoints para Jupiter
const JUPITER_ENDPOINTS = [
  "https://quote-api.jup.ag/v6",
  "https://jupiter-api-v6.fly.dev/v6",
  "https://jup.ag/v6"
];

// RPCs alternativas
const RPC_ENDPOINTS = [
  "https://api.mainnet-beta.solana.com",
  "https://rpc.ankr.com/solana",
  "https://solana-api.projectserum.com"
];

// ========================================================
//  Funções auxiliares
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

async function tryFetchWithFallback(urls, options = null) {
  let lastError = null;
  
  for (const url of urls) {
    try {
      console.log(`Tentando: ${url}`);
      const response = await fetch(url, options);
      if (response.ok) {
        return response;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      console.warn(`Falha em ${url}: ${error.message}`);
    }
  }
  
  throw lastError;
}

async function getQuoteFromJupiter(inputMint, outputMint, amount, slippageBps = 100) {
  const quoteUrls = JUPITER_ENDPOINTS.map(baseUrl => 
    `${baseUrl}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}&onlyDirectRoutes=false`
  );
  
  const response = await tryFetchWithFallback(quoteUrls);
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
  
  const options = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
        maxRetries: 3
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
//  Rotas
// ========================================================

router.post("/jupiter", async (req, res) => {
  console.log("Recebendo requisição de swap");
  
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
    
    // 1. Obter cotação
    const quoteData = await getQuoteFromJupiter(
      inputMint, 
      outputMint, 
      amountInSmallestUnits
    );
    
    // 2. Obter transação
    const swapData = await getSwapTransactionFromJupiter(
      quoteData, 
      carteiraUsuarioPublica
    );
    
    if (!swapData.swapTransaction) {
      throw new Error("Transação não gerada");
    }
    
    // 3. Assinar
    const userKeypair = parsePrivateKey(carteiraUsuarioPrivada);
    const transactionBuf = Buffer.from(swapData.swapTransaction, "base64");
    const transaction = VersionedTransaction.deserialize(transactionBuf);
    transaction.sign([userKeypair]);
    
    // 4. Enviar
    const signature = await sendTransactionWithFallback(transaction.serialize());
    
    // 5. Responder
    const outputAmount = direction === "USDC_TO_SOL" 
      ? (quoteData.outAmount / 1e9).toFixed(6)
      : (quoteData.outAmount / 1e6).toFixed(2);
    
    res.json({
      success: true,
      signature,
      direction,
      inputAmount: numAmount,
      outputAmount: parseFloat(outputAmount),
      explorerUrl: `https://solscan.io/tx/${signature}`,
      message: "Swap realizado com sucesso!",
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error("Erro no swap:", error);
    
    let errorMessage = "Erro ao processar swap";
    if (error.message.includes("insufficient funds")) {
      errorMessage = "Saldo insuficiente";
    } else if (error.message.includes("ENOTFOUND") || error.message.includes("network")) {
      errorMessage = "Problema de conexão. Tente novamente.";
    } else if (error.message.includes("timeout")) {
      errorMessage = "Tempo esgotado. Tente novamente.";
    }
    
    res.status(500).json({
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
});

// Rota de saúde simplificada
router.get("/health", (req, res) => {
  res.json({
    status: "online",
    service: "swap-api",
    timestamp: new Date().toISOString()
  });
});

module.exports = router;