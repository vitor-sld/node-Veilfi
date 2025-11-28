const express = require("express");
const router = express.Router();
const { PublicKey } = require("@solana/web3.js");
const { getOrCreateAssociatedTokenAccount, transfer } = require("@solana/spl-token");

const {
  connection,
  platformKeypair,
  platformPubkey,
  tokenMint
} = require("../services/solana");

const { TOKEN_PRICE_SOL, TOKEN_DECIMALS } = require("../env");

// Iniciar pedido
router.post("/init", (req, res) => {
  const { buyer } = req.body;

  if (!buyer)
    return res.json({ success: false, message: "buyer obrigatório" });

  const orderId = "ORDER_" + Math.random().toString(36).substring(2, 10);

  res.json({
    success: true,
    orderId,
    walletToPay: platformPubkey.toBase58()
  });
});

// Confirmar pagamento
router.post("/confirm", async (req, res) => {
  try {
    const { orderId, paymentSignature, buyer } = req.body;

    if (!orderId || !paymentSignature || !buyer)
      return res.json({
        success: false,
        message: "orderId, paymentSignature e buyer obrigatórios"
      });

    const tx = await connection.getTransaction(paymentSignature, {
      maxSupportedTransactionVersion: 0
    });

    if (!tx)
      return res.json({ success: false, message: "Transação não encontrada" });

    const solPaid = (tx.meta.postBalances[0] - tx.meta.preBalances[0]) / 1e9;

    const amountTokens = solPaid / TOKEN_PRICE_SOL;
    const smallestAmount = Math.floor(amountTokens * 10 ** TOKEN_DECIMALS);

    const buyerPubkey = new PublicKey(buyer);

    const buyerAta = await getOrCreateAssociatedTokenAccount(
      connection,
      platformKeypair,
      tokenMint,
      buyerPubkey
    );

    const platformAta = await getOrCreateAssociatedTokenAccount(
      connection,
      platformKeypair,
      tokenMint,
      platformKeypair.publicKey
    );

    const sig = await transfer(
      connection,
      platformKeypair,
      platformAta.address,
      buyerAta.address,
      platformKeypair,
      smallestAmount
    );

    res.json({
      success: true,
      tokensSent: smallestAmount,
      contractSignature: sig
    });

  } catch (err) {
    console.error(err);
    res.json({ success: false, message: "Erro interno" });
  }
});

module.exports = router;
