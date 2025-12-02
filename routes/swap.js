// ========================================================
//  Jupiter Swap (API Atualizada) - COM MELHOR TRATAMENTO DE ERROS
// ========================================================
const express = require("express");
const router = express.Router();
const {
  Connection,
  PublicKey,
  Keypair,
  VersionedTransaction,
} = require("@solana/web3.js");
const bs58 = require("bs58");
const fetch = require("node-fetch");

// Conexão RPC
const connection = new Connection(
  "https://api.mainnet-beta.solana.com",
  "confirmed"
);

// Mints
const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// Timeout para requisições (em milissegundos)
const REQUEST_TIMEOUT = 30000;

// Função para fetch com timeout
async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        ...options.headers,
      },
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${REQUEST_TIMEOUT}ms`);
    }
    throw error;
  }
}

// Parse da chave privada
function parsePrivateKey(secretKey) {
  try {
    if (secretKey.startsWith("[")) {
      const arr = JSON.parse(secretKey);
      return Keypair.fromSecretKey(new Uint8Array(arr));
    }
    return Keypair.fromSecretKey(bs58.decode(secretKey));
  } catch (err) {
    throw new Error(`Formato de chave inválido: ${err.message}`);
  }
}

// SWAP
router.post("/jupiter", async (req, res) => {
  try {
    console.log("=== SWAP REQUEST ===", {
      wallet: req.body.carteiraUsuarioPublica?.substring(0, 8) + "...",
      direction: req.body.direction,
      amount: req.body.amount
    });
    
    const { 
      carteiraUsuarioPublica, 
      carteiraUsuarioPrivada, 
      amount, 
      direction 
    } = req.body;

    // Validações
    if (!carteiraUsuarioPublica || !carteiraUsuarioPrivada) {
      return res.status(400).json({ 
        success: false,
        error: "Wallet e chave privada são obrigatórios" 
      });
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ 
        success: false,
        error: `Amount inválido: ${amount}` 
      });
    }

    // Normalize direction to be case-insensitive and accept several common formats
    function normalizeDirection(dir, from, to) {
      if (!dir && from && to) {
        dir = `${from}_TO_${to}`;
      }
      if (!dir || typeof dir !== 'string') return null;
      const d = dir.trim().toUpperCase();
      const cleaned = d.replace(/[^A-Z0-9]/g, '_').replace(/_+/g, '_');
      if (cleaned.includes('SOL') && cleaned.includes('USDC')) {
        return cleaned.indexOf('SOL') < cleaned.indexOf('USDC') ? 'SOL_TO_USDC' : 'USDC_TO_SOL';
      }
      return null;
    }

    const normalizedDirection = normalizeDirection(direction, req.body.from, req.body.to);
    console.log("Normalized direction computed:", normalizedDirection);
    if (!normalizedDirection) {
      return res.status(400).json({ 
        success: false,
        error: "Direction inválida. Envie 'direction' como 'SOL_TO_USDC' ou 'USDC_TO_SOL' (aceita formas como 'SOL-USDC', 'sol->usdc', 'sol_usdc' etc.), ou envie 'from' e 'to' (e.g. from: 'SOL', to: 'USDC').",
        received: direction
      });
    }
    // Use canonical direction value going forward
    const canonicalDirection = normalizedDirection;

    let inputMint, outputMint, amountInSmallestUnits;
    let inputSymbol, outputSymbol;

    if (canonicalDirection === "SOL_TO_USDC") {
      inputMint = SOL_MINT;
      outputMint = USDC_MINT;
      amountInSmallestUnits = Math.floor(numAmount * 1e9);
      inputSymbol = "SOL";
      outputSymbol = "USDC";
    } else {
      inputMint = USDC_MINT;
      outputMint = SOL_MINT;
      amountInSmallestUnits = Math.floor(numAmount * 1e6);
      inputSymbol = "USDC";
      outputSymbol = "SOL";
    }

    console.log(`Swap config: ${numAmount} ${inputSymbol} -> ${outputSymbol}`);
    console.log(`Input mint: ${inputMint}`);
    console.log(`Output mint: ${outputMint}`);
    console.log(`Amount in smallest units: ${amountInSmallestUnits}`);

    // 1. OBTER QUOTE
    const quoteUrl = `https://quote-api.jup.ag/v6/quote` +
      `?inputMint=${inputMint}` +
      `&outputMint=${outputMint}` +
      `&amount=${amountInSmallestUnits}` +
      `&slippageBps=100` +
      `&onlyDirectRoutes=false` +
      `&maxAccounts=20`;

    console.log("Fetching quote from Jupiter...");
    
    let quoteResponse;
    try {
      quoteResponse = await fetchWithTimeout(quoteUrl);
    } catch (fetchError) {
      console.error("Erro ao buscar quote:", fetchError);
      return res.status(500).json({
        success: false,
        error: `Não foi possível conectar à Jupiter API. Verifique a conectividade de rede do servidor.`,
        details: fetchError.message
      });
    }
    
    const quoteData = await quoteResponse.json();

    if (quoteData.error) {
      console.error("Jupiter quote error:", quoteData);
      return res.status(500).json({
        success: false,
        error: `Jupiter: ${quoteData.error}`,
        details: quoteData
      });
    }

    if (!quoteData.outAmount) {
      return res.status(500).json({
        success: false,
        error: "Não foi possível obter cotação",
        details: quoteData
      });
    }

    console.log("Quote obtida:", {
      inAmount: quoteData.inAmount,
      outAmount: quoteData.outAmount,
      priceImpact: quoteData.priceImpactPct
    });

    // 2. OBTER TRANSACTION
    console.log("Obtendo transação...");
    
    const swapResponse = await fetchWithTimeout("https://quote-api.jup.ag/v6/swap", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        quoteResponse: quoteData,
        userPublicKey: carteiraUsuarioPublica,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: {
          priorityLevelWithMaxLamports: {
            priorityLevel: "veryHigh",
            maxLamports: 1000000
          }
        },
        useSharedAccounts: true
      }),
    });

    const swapData = await swapResponse.json();

    if (swapData.error) {
      console.error("Swap transaction error:", swapData);
      return res.status(500).json({
        success: false,
        error: `Swap: ${swapData.error}`,
        details: swapData
      });
    }

    if (!swapData.swapTransaction) {
      return res.status(500).json({
        success: false,
        error: "Transação de swap não gerada",
        details: swapData
      });
    }

    // 3. ASSINAR E ENVIAR
    console.log("Assinando transação...");
    
    const userKeypair = parsePrivateKey(carteiraUsuarioPrivada);
    
    const swapTransactionBuf = Buffer.from(swapData.swapTransaction, "base64");
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
    
    transaction.sign([userKeypair]);

    console.log("Enviando transação...");
    const rawTransaction = transaction.serialize();
    const signature = await connection.sendRawTransaction(rawTransaction, {
      skipPreflight: false,
      preflightCommitment: "confirmed",
      maxRetries: 5,
    });

    console.log("Transação enviada. Assinatura:", signature);

    // Aguardar confirmação (assíncrono)
    setTimeout(async () => {
      try {
        const confirmation = await connection.confirmTransaction(signature, "confirmed");
        console.log("Confirmação:", confirmation.value);
      } catch (confErr) {
        console.warn("Erro na confirmação:", confErr.message);
      }
    }, 1000);

    // 4. RETORNAR RESULTADO
    const outputAmount = canonicalDirection === "USDC_TO_SOL" 
      ? (quoteData.outAmount / 1e9).toFixed(6) + " SOL"
      : (quoteData.outAmount / 1e6).toFixed(2) + " USDC";

    const result = {
      success: true,
      signature,
      direction: canonicalDirection,
      inputAmount: `${amount} ${inputSymbol}`,
      outputAmount: outputAmount,
      explorerUrl: `https://solscan.io/tx/${signature}`,
      message: "Swap iniciado com sucesso!",
      timestamp: new Date().toISOString()
    };

    console.log("Swap processado com sucesso!");
    return res.json(result);

  } catch (error) {
    console.error("ERRO NO SWAP:", error);
    
    let errorMessage = "Erro ao processar swap";
    
    if (error.message.includes("insufficient funds")) {
      errorMessage = "Saldo insuficiente";
    } else if (error.message.includes("Blockhash not found")) {
      errorMessage = "Tempo expirado. Recarregue e tente novamente";
    } else if (error.message.includes("signature")) {
      errorMessage = "Erro na assinatura";
    } else if (error.message.includes("invalid secret key")) {
      errorMessage = "Chave privada inválida";
    } else if (error.message.includes("Request timeout")) {
      errorMessage = "Timeout ao conectar com a Jupiter. Tente novamente mais tarde.";
    } else if (error.message.includes("ENOTFOUND") || error.message.includes("getaddrinfo")) {
      errorMessage = "Erro de conexão. Verifique a rede do servidor.";
    }

    return res.status(500).json({
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
});

// Health check com teste de conectividade com Jupiter
router.get("/health", async (req, res) => {
  try {
    // Tenta obter uma quote simples
    const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${SOL_MINT}&outputMint=${USDC_MINT}&amount=10000000&slippageBps=50`;
    
    const quoteResponse = await fetchWithTimeout(quoteUrl);
    const quoteData = await quoteResponse.json();

    if (quoteData.error) {
      throw new Error(quoteData.error);
    }

    res.json({
      status: "healthy",
      jupiterApi: "online",
      solanaConnection: "connected",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Health check error:", error);
    res.status(500).json({
      status: "unhealthy",
      error: error.message,
      jupiterApi: "offline"
    });
  }
});

module.exports = router;