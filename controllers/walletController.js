// server/controllers/walletController.js
const { Connection, PublicKey, Keypair, SystemProgram, sendAndConfirmTransaction } = require("@solana/web3.js");

/**
 * POST /wallet/send
 * body: { to: string, amount: number }
 * - requer sessão válida (sid cookie)
 * - secretKey deve estar na sessão (apenas dev)
 */
async function sendSOL(req, res) {
  try {
    const session = req.sessionObject; // injetado pelo middleware em server.js (veja abaixo)
    if (!session) return res.status(401).json({ ok: false, error: "NO_SESSION" });

    const { secretKey } = session;
    if (!secretKey || !Array.isArray(secretKey) || secretKey.length !== 64) {
      return res.status(401).json({ ok: false, error: "NO_KEYPAIR" });
    }

    const { to, amount } = req.body;
    if (!to || typeof to !== "string") return res.status(400).json({ ok: false, error: "INVALID_DEST" });
    if (!amount || typeof amount !== "number" || amount <= 0) return res.status(400).json({ ok: false, error: "INVALID_AMOUNT" });

    const RPC = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
    const connection = new Connection(RPC, "confirmed");

    const fromKeypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));
    const toPubkey = new PublicKey(to);
    const lamports = Math.floor(amount * 1e9);

    const tx = SystemProgram.transfer({
      fromPubkey: fromKeypair.publicKey,
      toPubkey,
      lamports,
    });

    const transaction = await connection.sendTransaction(
      {
        recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
        feePayer: fromKeypair.publicKey,
        instructions: [tx],
      },
      [fromKeypair]
    );

    // opcionalmente usar sendAndConfirmTransaction se preferir
    return res.json({ ok: true, signature: transaction, explorer: `https://explorer.solana.com/tx/${transaction}` });
  } catch (err) {
    console.error("SEND ERROR:", err);
    return res.status(500).json({ ok: false, error: "SEND_FAILED", details: err?.message || String(err) });
  }
}

module.exports = { sendSOL };
