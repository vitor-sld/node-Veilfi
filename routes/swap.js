// ========================
//  Arquivo: swap.js
// ========================

require("dotenv").config();
const express = require("express");
const router = express.Router();

const {
    Connection,
    Keypair,
    PublicKey,
    Transaction,
    SystemProgram,
    LAMPORTS_PER_SOL,
    sendAndConfirmTransaction,
} = require("@solana/web3.js");

const {
    getOrCreateAssociatedTokenAccount,
    transfer,
} = require("@solana/spl-token");

// ================================
//   CONFIGURAÇÕES DO SISTEMA
// ================================

const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");

const plataformaPublicKey = new PublicKey(process.env.carteira_publica);
const plataformaPrivateKey = Uint8Array.from(JSON.parse(process.env.carteira_privada));
const plataformaKeypair = Keypair.fromSecretKey(plataformaPrivateKey);

const mintPump = new PublicKey(process.env.moedaCliente);

// ==========================================
//         ENDPOINT DO SWAP
// ==========================================

router.post("/buy", async (req, res) => {
    try {
        const { carteiraUsuarioPublica, carteiraUsuarioPrivada, amountSOL } = req.body;

        if (!carteiraUsuarioPublica || !carteiraUsuarioPrivada || !amountSOL) {
            return res.status(400).json({ error: "Dados incompletos." });
        }

        const quantidadeSol = parseFloat(amountSOL);
        if (quantidadeSol <= 0) {
            return res.status(400).json({ error: "Valor inválido." });
        }

        // ===========================
        //   CARTEIRA DO USUÁRIO
        // ===========================
        const usuarioPublicKey = new PublicKey(carteiraUsuarioPublica);
        const usuarioPrivateKey = Uint8Array.from(JSON.parse(carteiraUsuarioPrivada));
        const usuarioKeypair = Keypair.fromSecretKey(usuarioPrivateKey);

        // ===========================================================
        //  1️⃣ ENVIAR SOL DO USUÁRIO → TESOURO
        // ===========================================================

        const transferirSolTx = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: usuarioPublicKey,
                toPubkey: plataformaPublicKey,
                lamports: quantidadeSol * LAMPORTS_PER_SOL,
            })
        );

        const assinaturaSol = await sendAndConfirmTransaction(
            connection,
            transferirSolTx,
            [usuarioKeypair]
        );

        // ===========================================================
        //  2️⃣ CALCULAR TOKEN PUMP
        // ===========================================================

        const TAXA = 1000; // 1 SOL = 1000 PUMP (ajuste se quiser)
        const quantidadePump = quantidadeSol * TAXA;

        // ===========================================================
        //  3️⃣ ENVIAR PUMP PARA O USUÁRIO
        // ===========================================================

        const ataTesouro = await getOrCreateAssociatedTokenAccount(
            connection,
            plataformaKeypair,
            mintPump,
            plataformaPublicKey
        );

        const ataUsuario = await getOrCreateAssociatedTokenAccount(
            connection,
            plataformaKeypair,
            mintPump,
            usuarioPublicKey
        );

        const assinaturaPump = await transfer(
            connection,
            plataformaKeypair,
            ataTesouro.address,
            ataUsuario.address,
            plataformaKeypair.publicKey,
            quantidadePump
        );

        // ===========================================================
        //  FINALIZAÇÃO
        // ===========================================================

        return res.json({
            sucesso: true,
            mensagem: "Swap realizado com sucesso!",
            sol_debitado: quantidadeSol,
            pump_creditado: quantidadePump,
            assinatura_saqueSOL: assinaturaSol,
            assinatura_envioPUMP: assinaturaPump,
        });

    } catch (err) {
        console.error("Erro no swap:", err);
        return res.status(500).json({ error: "Erro ao realizar o swap." });
    }
});

module.exports = router;
