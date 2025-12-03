// =======================================================
//  VeilFi — Swap Oficial usando Jupiter HTTP API (CORRIGIDO)
// =======================================================
require("dotenv").config();
const express = require("express");
const router = express.Router();

const {
  Connection,
  Keypair,
  VersionedTransaction,
} = require("@solana/web3.js");

const bs58 = require("bs58");
const fetch = require("node-fetch");

// =======================================================
//  RPC Connection
// =======================================================
const connection = new Connection(
  process.env.RPC_ENDPOINT ||
    "https://api.mainnet-beta.solana.com",
  "confirmed"
);

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
//  Normaliza a direction enviada pelo front
// =======================================================
function normalizeDirection(direction) {
  if (!direction) return null;

  const dir = direction.toUpperCase();

  // Seu formato atual
  if (dir === "SOL_TO_USDC") return "SOL_TO_USDC";
  if (dir === "USDC_TO_SOL") return "USDC_TO_SOL";

  // Jupiter padrão
  if (dir === "INPUT") return "SOL_TO_USDC";
  if (dir === "OUTPUT") return "USDC_TO_SOL";

  // Alternativas comuns
  if (dir === "IN") return "SOL_TO_USDC";
  if (dir === "OUT") return "USDC_TO_SOL";

  if (dir === "BUY") return "USDC_TO_SOL";
  if (dir === "SELL") return "SOL_TO_USDC";

  // Se nada bater → inválido
  return null;
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

    // Normaliza direction para o formato final
    const dir = normalizeDirection(direction);

    if (!dir) {
      return res.status(400).json({ error: "Direção inválida" });
    }

    // Mints
    const SOL = "So11111111111111111111111111111111111111112";
    const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

    let inputMint, outputMint, atomicAmount;

    // ===================================================
    //  Direção (sempre garantido após normalizeDirection)
    // ===================================================
    if (dir === "SOL_TO_USDC") {
      inputMint = SOL;
      outputMint = USDC;
      atomicAmount = Math.floor(amount * 1e9); // lamports
    } else {
      inputMint = USDC;
      outputMint = SOL;
      atomicAmount = Math.floor(amount * 1e6); // micro USDC
    }

    console.log("=== VEILFI — NOVO SWAP JUPITER ===");
    console.log("Direction normalizada:", dir);
    console.log("Input:", inputMint);
    console.log("Output:", outputMint);
    console.log("Atomic Amount:", atomicAmount);

    // ===================================================
    //  1) QUOTE
    // ===================================================
    const quoteResponse = await fetch(
      `https://api.jup.ag/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${atomicAmount}&slippageBps=100`
    );

    const quote = await quoteResponse.json();

    if (!quote || !quote.outAmount) {
      return res.status(500).json({
        error: "Erro ao obter cotação",
        details: quote,
      });
    }

    // ===================================================
    //  2) TRANSAÇÃO DE SWAP
    // ===================================================
    const swapResponse = await fetch(
      "https://api.jup.ag/swap/v1/swap",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quote,
          userPublicKey: carteiraUsuarioPublica,
        }),
      }
    );

    const swapTx = await swapResponse.json();

    if (!swapTx.swapTransaction) {
      return res.status(500).json({
        error: "Swap transaction não gerada",
        details: swapTx,
      });
    }

    // ===================================================
    //  3) ASSINAR TRANSAÇÃO
    // ===================================================
    const user = parsePrivateKey(carteiraUsuarioPrivada);

    const txBuf = Buffer.from(swapTx.swapTransaction, "base64");
    const tx = VersionedTransaction.deserialize(txBuf);

    tx.sign([user]);

    // ===================================================
    //  4) ENVIAR PARA A SOLANA
    // ===================================================
    const signature = await connection.sendRawTransaction(
      tx.serialize(),
      { skipPreflight: false }
    );

    await connection.confirmTransaction(signature, "confirmed");

    return res.json({
      sucesso: true,
      signature,
      direction: dir,
      enviado: amount,
      recebido:
        dir === "SOL_TO_USDC"
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
