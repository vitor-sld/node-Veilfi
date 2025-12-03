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

const JUPITER_QUOTE = "https://api.jup.ag/v6/quote";
const JUPITER_SWAP = "https://api.jup.ag/v6/swap";

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
// Body: { from: "SOL"|"USDC", to: "SOL"|"USDC", amount: number }
router.post("/quote", async (req, res) => {
  try {
    const { from, to, amount } = req.body;

    if (!from || !to || !amount) {
      return res.status(400).json({
        error: "Parâmetros inválidos",
        details: "from, to e amount são obrigatórios",
      });
    }

    const inputMint = from.toUpperCase() === "SOL" ? SOL_MINT : USDC_MINT;
    const outputMint = to.toUpperCase() === "SOL" ? SOL_MINT : USDC_MINT;
    const atomicAmount = uiAmountToAtomic(Number(amount), inputMint);

    const url = `${JUPITER_QUOTE}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${atomicAmount}&slippageBps=50`;

    const { data } = await axios.get(url);

    return res.json(data);
  } catch (err) {
    console.error("QUOTE ERROR:", err.response?.data || err.message);
    return res.status(500).json({
      error: "Erro ao obter cotação",
      details: err.response?.data || err.message,
    });
  }
});

// POST /swap
// Body: { carteiraUsuarioPublica, carteiraUsuarioPrivada, from: "SOL"|"USDC", to: "SOL"|"USDC", amount: number }
router.post("/swap", async (req, res) => {
  try {
    const { carteiraUsuarioPublica, carteiraUsuarioPrivada, from, to, amount } = req.body;

    if (!carteiraUsuarioPublica || !carteiraUsuarioPrivada || !from || !to || !amount) {
      return res.status(400).json({ error: "Parâmetros ausentes" });
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
    console.error("SWAP ERROR:", err.response?.data || err.message);
    return res.status(500).json({
      error: "Erro ao executar swap",
      details: err.response?.data || err.message,
    });
  }
});

// ================================
// START SERVER
// ================================
router.listen(PORT, () => console.log(`Backend rodando na porta ${PORT}`));

