// ========================
//  swap.js — Jupiter SOL <-> USDC
// ========================

require("dotenv").config();
const express = require("express");
const router = express.Router();
const {
  Connection,
  PublicKey,
  Keypair,
  VersionedTransaction,
} = require("@solana/web3.js");

const bs58 = require("bs58");

// ============================================================
//  🔥 Função DEFINITIVA para aceitar QUALQUER tipo de secretKey
//     - array real
//     - objeto {0:1,1:2}
//     - string JSON "[...]"
//     - string "1,2,3"
//     - base58 Phantom "3xhG...."
// ============================================================
function toUint8Array(secretKey) {
  try {
    // 1) Se já for Uint8Array
    if (secretKey instanceof Uint8Array) {
      return secretKey;
    }

    // 2) Array real (vindo certo do front)
    if (Array.isArray(secretKey)) {
      return Uint8Array.from(secretKey);
    }

    // 3) Objeto {0:12,1:55,...}
    if (typeof secretKey === "object" && secretKey !== null) {
      const values = Object.values(secretKey);
      if (values.length === 64) {
        return Uint8Array.from(values);
      }
    }

    // 4) String JSON: "[1,2,3]"
    if (typeof secretKey === "string" && secretKey.trim().startsWith("[")) {
      const arr = JSON.parse(secretKey);
      return Uint8Array.from(arr);
    }

    // 5) Base58 Phantom (somente letras de base58)
    if (typeof secretKey === "string" && /^[1-9A-HJ-NP-Za-km-z]+$/.test(secretKey)) {
      return bs58.decode(secretKey);
    }

    // 6) String "1,2,3"
    if (typeof secretKey === "string" && secretKey.includes(",")) {
      const arr = secretKey.split(",").map(n => Number(n.trim()));
      if (arr.length === 64) {
        return Uint8Array.from(arr);
      }
    }

    throw new Error("Formato de secretKey inválido.");
  } catch (err) {
    console.error("ERRO CONVERSÃO DE CHAVE:", err);
    throw new Error("SecretKey inválida.");
  }
}

// ============================================================
//  Configurações
// ============================================================
const USDC_MINT = "EPjFWdd5AufqSSqeM2q9HGnFz4Hh9ms4HjHpx2xJLxY";
const SOL_MINT = "So11111111111111111111111111111111111111112";

const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");

// ============================================================
//  🔥 ROTA ÚNICA DO SWAP VIA JUPITER
// ============================================================
router.post("/usdc", async (req, res) => {
  try {
    const {
      carteiraUsuarioPublica,
      carteiraUsuarioPrivada,
      amount,
      direction,
    } = req.body;

    // ======================================
    //  VALIDAÇÕES INICIAIS
    // ======================================
    if (!carteiraUsuarioPublica || !carteiraUsuarioPrivada || !amount || !direction) {
      return res.status(400).json({ error: "Dados incompletos." });
    }

    console.log("\n=== SWAP REQUEST RECEIVED ===");
    console.log("Public:", carteiraUsuarioPublica);
    console.log("PRIVATE RAW:", carteiraUsuarioPrivada);
    console.log("TYPE:", typeof carteiraUsuarioPrivada);

    // Converter chave
    const userUint8 = toUint8Array(carteiraUsuarioPrivada);
    const userKeypair = Keypair.fromSecretKey(userUint8);

    const userPublicKey = new PublicKey(carteiraUsuarioPublica);

    // ======================================
    //  CONFIG DA DIREÇÃO
    // ======================================
    let inputMint, outputMint, amountAtomic;

    if (direction === "SOL_TO_USDC") {
      inputMint = SOL_MINT;
      outputMint = USDC_MINT;
      amountAtomic = Math.floor(Number(amount) * 1e9);
    } else if (direction === "USDC_TO_SOL") {
      inputMint = USDC_MINT;
      outputMint = SOL_MINT;
      amountAtomic = Math.floor(Number(amount) * 1e6);
    } else {
      return res.status(400).json({ error: "Direção inválida." });
    }

    // ======================================
    //  1) Obter cotação Jupiter
    // ======================================
    const quoteResponse = await fetch(
      `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountAtomic}`
    );

    const quote = await quoteResponse.json();

    if (!quote.outAmount) {
      console.log("ERRO: Cotação inválida:", quote);
      return res.status(500).json({ error: "Falha ao obter cotação Jupiter." });
    }

    // ======================================
    //  2) Montar a transação
    // ======================================
    const swapResp = await fetch("https://quote-api.jup.ag/v6/swap", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        quote,
        userPublicKey: userPublicKey.toBase58(),
        wrapAndUnwrapSol: true,
      }),
    });

    const jsonSwap = await swapResp.json();

    if (!jsonSwap.swapTransaction) {
      console.log("ERRO AO MONTAR TX:", jsonSwap);
      return res.status(500).json({ error: "Falha ao montar transação Jupiter." });
    }

    // ======================================
    //  3) Assinar e enviar TX
    // ======================================
    const txBuffer = Buffer.from(jsonSwap.swapTransaction, "base64");
    const transaction = VersionedTransaction.deserialize(txBuffer);

    transaction.sign([userKeypair]);

    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
    });

    console.log("TX SIGNATURE:", signature);

    await connection.confirmTransaction(signature, "confirmed");

    // ======================================
    //  4) Retorno
    // ======================================
    return res.json({
      sucesso: true,
      assinatura: signature,
      direcao: direction,
      valor_recebido: quote.outAmount,
    });

  } catch (err) {
    console.error("Erro no swap:", err);
    return res.status(500).json({ error: "Erro ao realizar o swap." });
  }
});

module.exports = router;
