const express = require("express");
const axios = require("axios");

const router = express.Router();

// ===============================
//      JUPITER URLs CORRETAS
// ===============================
const JUP_API = "https://api.jup.ag/v6/quote";
const JUPITER_SWAP = "https://api.jup.ag/v6/swap";

// TOKENS MAINNET
const TOKENS = {
  SOL: "So11111111111111111111111111111111111111112",
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
};

function uiAmountToAtomic(amountUI, mint) {
  if (mint === TOKENS.SOL) return Math.round(amountUI * 1_000_000_000);
  if (mint === TOKENS.USDC) return Math.round(amountUI * 1_000_000);
  return amountUI;
}

/* ===============================
        GET QUOTE (V6)
=============================== */
router.post("/quote", async (req, res) => {
  try {
    const { from, to, amount } = req.body;

    if (!from || !to || !amount) {
      return res.status(400).json({
        error: "Parâmetros inválidos",
        details: "from, to e amount são obrigatórios"
      });
    }

    const inputMint = TOKENS[from.toUpperCase()];
    const outputMint = TOKENS[to.toUpperCase()];
    const atomicAmount = uiAmountToAtomic(Number(amount), inputMint);

    const url = `${JUP_API}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${atomicAmount}`;

    const { data } = await axios.get(url, {
      headers: { "User-Agent": "MyApp/1.0" }
    });

    return res.json(data);

  } catch (err) {
    console.error("Erro Jupiter:", err.response?.data || err.message);

    return res.status(500).json({
      error: "Erro ao obter cotação",
      details: err.response?.data || err.message,
    });
  }
});

/* ===============================
              SWAP (V6)
=============================== */
router.post("/swap", async (req, res) => {
  try {
    const { userPublicKey, quoteResponse } = req.body;

    if (!userPublicKey || !quoteResponse) {
      return res.status(400).json({ error: "Parâmetros ausentes" });
    }

    const response = await axios.post(
      JUPITER_SWAP,
      {
        quoteResponse,
        userPublicKey,
        wrapAndUnwrapSol: true,
      },
      {
        headers: { "User-Agent": "MyApp/1.0" }
      }
    );

    return res.json(response.data);

  } catch (err) {
    console.error("SWAP ERROR:", err.response?.data || err.message);

    return res.status(500).json({
      error: "Erro ao criar transação de swap",
      details: err.response?.data || err.message,
    });
  }
});

module.exports = router;
