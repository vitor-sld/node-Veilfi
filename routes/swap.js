const express = require("express");
const axios = require("axios");

const router = express.Router();

const JUPITER_QUOTE = "https://quote-api.jup.ag/v6/quote";
const JUPITER_SWAP = "https://quote-api.jup.ag/v6/swap";

// TOKENS MAINNET
const TOKENS = {
  SOL: "So11111111111111111111111111111111111111112",
  JUP: "JUP4Fb2cqiRU9RjXG1Sp4Kx83b8JkXo7n6d1M9UUb5X",
};

/* ===============================
        GET QUOTE (COTAÇÃO)
=============================== */
router.get("/quote", async (req, res) => {
  try {
    const { from, to, amount } = req.query;

    if (!from || !to || !amount) {
      return res.status(400).json({ error: "Parâmetros inválidos" });
    }

    const inputMint = TOKENS[from.toUpperCase()];
    const outputMint = TOKENS[to.toUpperCase()];

    if (!inputMint || !outputMint) {
      return res.status(400).json({ error: "Token inválido" });
    }

    const url = `${JUPITER_QUOTE}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=50`;

    const response = await axios.get(url);

    return res.json(response.data);
  } catch (err) {
    console.error("QUOTE ERROR:", err.response?.data || err.message);
    return res.status(500).json({
      error: "Erro ao obter cotação",
      details: err.response?.data || err.message,
    });
  }
});

/* ===============================
              SWAP
=============================== */
router.post("/swap", async (req, res) => {
  try {
    const { userPublicKey, quoteResponse } = req.body;

    if (!userPublicKey || !quoteResponse) {
      return res.status(400).json({ error: "Parâmetros ausentes" });
    }

    // Monta a transação pelo Jupiter
    const response = await axios.post(JUPITER_SWAP, {
      quoteResponse,
      userPublicKey,
      wrapAndUnwrapSol: true,
    });

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
