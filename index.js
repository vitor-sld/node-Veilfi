const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const {
  Keypair,
  PublicKey,
  Connection,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction
} = require("@solana/web3.js");

const app = express();
const PORT = process.env.PORT || 3001;

// =====================
// 🔥 CORS CORRIGIDO
// =====================
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "https://veifi-vite.onrender.com",
      "*",
    ],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
    credentials: true,
  })
);

app.options("*", cors());
app.use(express.json());
app.use(cookieParser());

// RPC principal
const connection = new Connection(
  "https://frequent-soft-daylight.solana-mainnet.quiknode.pro/db097341fa55b3a5bf3e5d96776910263c3a492a/"
);

// Sessões simples em memória
const sessions = new Map();

function getSession(req) {
  const sid = req.cookies?.sid;
  return sid && sessions.has(sid) ? sessions.get(sid) : null;
}

function createSession(walletPubkey, secretKey, res) {
  const sid = Math.random().toString(36).slice(2);
  sessions.set(sid, { walletPubkey, secretKey });
  res.cookie("sid", sid, { httpOnly: true });
  return sid;
}

// ========================================
// 📥 IMPORTA WALLET VIA PRIVATEKEY (64 bytes)
// ========================================
app.post("/auth/import", (req, res) => {
  const { input } = req.body;

  try {
    const parsed = JSON.parse(input);

    if (!Array.isArray(parsed) || parsed.length !== 64) {
      return res.status(400).json({
        message: "Formato inválido (esperado: JSON array com 64 bytes)",
      });
    }

    const kp = Keypair.fromSecretKey(Uint8Array.from(parsed));
    const pubkey = kp.publicKey.toBase58();

    createSession(pubkey, Array.from(kp.secretKey), res);

    return res.json({
      walletAddress: pubkey,
      secretKey: Array.from(kp.secretKey),
    });
  } catch {
    return res.status(400).json({
      message: "Entrada inválida. Esperado array JSON de 64 números.",
    });
  }
});

// ========================================
// 🧪 SESSÃO ATUAL
// ========================================
app.get("/session/me", (req, res) => {
  const session = getSession(req);
  if (!session) return res.json({ ok: false });

  return res.json({
    ok: true,
    user: { walletPubkey: session.walletPubkey },
  });
});

// ========================================
// 💰 SALDO
// ========================================
app.post("/user/balance", async (req, res) => {
  const { userPubkey } = req.body;

  if (!userPubkey) {
    return res.status(400).json({ message: "userPubkey é obrigatório" });
  }

  try {
    const pubkey = new PublicKey(userPubkey);
    const lamports = await connection.getBalance(pubkey);
    return res.json({ balance: lamports / 1e9 });
  } catch {
    return res.status(400).json({ message: "Erro ao buscar saldo" });
  }
});

// ========================================
// 🚀 ENVIO DE SOL REAL — /wallet/send
// ========================================
app.post("/wallet/send", async (req, res) => {
  try {
    const session = getSession(req);

    if (!session) {
      return res.status(401).json({ ok: false, error: "NO_SESSION" });
    }

    const { walletPubkey, secretKey } = session;
    const { to, amount } = req.body;

    if (!to) return res.status(400).json({ ok: false, error: "INVALID_TO" });
    if (!amount || amount <= 0)
      return res.status(400).json({ ok: false, error: "INVALID_AMOUNT" });

    const fromKeypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));
    const toPubkey = new PublicKey(to);
    const lamports = Math.floor(amount * 1e9);

    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: fromKeypair.publicKey,
        toPubkey,
        lamports,
      })
    );

    const signature = await sendAndConfirmTransaction(
      connection,
      tx,
      [fromKeypair],
      { commitment: "confirmed" }
    );

    return res.json({
      ok: true,
      signature,
      explorer: `https://explorer.solana.com/tx/${signature}`,
    });
  } catch (err) {
    console.error("SEND ERROR:", err);
    return res.status(500).json({
      ok: false,
      error: "SEND_FAILED",
      details: err.message,
    });
  }
});

// ========================================
// ▶️ INICIAR SERVIDOR
// ========================================
app.listen(PORT, () => {
  console.log(`API rodando em http://localhost:${PORT}`);
});
