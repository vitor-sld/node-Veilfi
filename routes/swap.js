// =======================================================
//  VeilFi — Swap Oficial usando jupiter-swap-api-client
// =======================================================
require("dotenv").config();
const express = require("express");
const router = express.Router();

const {
  Connection,
  Keypair,
  PublicKey,
  VersionedTransaction,
} = require("@solana/web3.js");

const bs58 = require("bs58");

// 🚀 OFICIAL Jupiter Client
const {
  JupiterSwapApi,
} = require("jupiter-swap-api-client");

// =======================================================
//  RPC Connection
// =======================================================
const connection = new Connection(
  process.env.RPC_ENDPOINT ||
    "https://api.mainnet-beta.solana.com",
  "confirmed"
);

// =======================================================
//  Inicializa o client da Jupiter
// =======================================================
const jupiter = new JupiterSwapApi({
  basePath: "https://api.jup.ag", // URL nova, confiável
  fetch: (...args) => fetch(...args),
});

// =======================================================
//  Converte a chave privada base58
// =======================================================
function parsePrivateKey(secretKey) {
  try {
    return Keypair.fromSecretKey(bs58.decode(secretKey));
  } catch (err) {
    console.error("PrivateKey decode error:", err);
    throw new Error("Chave privada inválida.");
  }
}

// =======================================================
//  ROTA PRINCIPAL DO SWAP
// =======================================================
router.post("/jupiter", async (req, res) => {
  try {
    const {
      carteiraUsuarioPublica,
      carteiraUsuarioPrivada,
      amount,
      direction,
    } = req.body;

    if (!carteiraUsuarioPublica || !carteiraUsuarioPrivada) {
      return res.status(400).json({
        error:
          "Faltando carteiraUsuarioPublica ou carteiraUsuarioPrivada",
      });
    }

    if (!amount || Number(amount) <= 0)
      return res.status(400).json({ error: "Amount inválido" });

    // Mints Oficiais
    const SOL = "So11111111111111111111111111111111111111112";
    const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

    let inputMint, outputMint, atomicAmount;

    // ===================================================
    //  Direção (SOL → USDC ou USDC → SOL)
    // ===================================================
    if (direction === "SOL_TO_USDC") {
      inputMint = SOL;
      outputMint = USDC;
      atomicAmount = Math.floor(amount * 1e9); // lamports
    } else if (direction === "USDC_TO_SOL") {
      inputMint = USDC;
      outputMint = SOL;
      atomicAmount = Math.floor(amount * 1e6);
    } else {
      return res.status(400).json({ error: "Direção inválida" });
    }

    console.log("=== VEILFI — NOVO SWAP JUPITER ===");
    console.log("Input:", inputMint);
    console.log("Output:", outputMint);
    console.log("Atomic amount:", atomicAmount);

    // ===================================================
    //  1) QUOTE
    // ===================================================
    const quote = await jupiter.quoteGet({
      inputMint,
      outputMint,
      amount: atomicAmount,
      slippageBps: 100,
    });

    if (!quote || !quote.outAmount) {
      return res.status(500).json({
        error: "Erro ao obter cotação",
        details: quote,
      });
    }

    // ===================================================
    //  2) Transação gerada pela Jupiter
    // ===================================================
    const swapTx = await jupiter.swapPost({
      swapRequest: {
        quote,
        userPublicKey: carteiraUsuarioPublica,
      },
    });

    if (!swapTx.swapTransaction) {
      return res.status(500).json({
        error: "Swap transaction não gerada",
        details: swapTx,
      });
    }

    // ===================================================
    //  3) ASSINAR
    // ===================================================
    const user = parsePrivateKey(carteiraUsuarioPrivada);

    const txBuf = Buffer.from(swapTx.swapTransaction, "base64");
    const tx = VersionedTransaction.deserialize(txBuf);

    tx.sign([user]);

    // ===================================================
    //  4) ENVIAR
    // ===================================================
    const signature = await connection.sendRawTransaction(
      tx.serialize(),
      {
        skipPreflight: false,
      }
    );

    await connection.confirmTransaction(signature, "confirmed");

    return res.json({
      sucesso: true,
      signature,
      direcao: direction,
      enviado: amount,
      recebido:
        direction === "SOL_TO_USDC"
          ? quote.outAmount / 1e6
          : quote.outAmount / 1e9,
    });
  } catch (err) {
    console.error("SWAP BACKEND ERROR:", err);

    return res.status(500).json({
      error: "Erro ao executar swap.",
      details: err.message,
    });
  }
});

module.exports = router;
