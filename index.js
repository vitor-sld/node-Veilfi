// server.js
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { Keypair, PublicKey, Connection } = require("@solana/web3.js");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(express.json());
app.use(cookieParser());

const connection = new Connection("https://frequent-soft-daylight.solana-mainnet.quiknode.pro/db097341fa55b3a5bf3e5d96776910263c3a492a/");
const sessions = new Map(); // chave: sessionId, valor: { walletPubkey }

function getSession(req) {
  const sid = req.cookies?.sid;
  return sid && sessions.has(sid) ? sessions.get(sid) : null;
}

function createSession(walletPubkey, res) {
  const sid = Math.random().toString(36).slice(2);
  sessions.set(sid, { walletPubkey });
  res.cookie("sid", sid, { httpOnly: true });
  return sid;
}

// 📥 Importa carteira
app.post("/auth/import", (req, res) => {
  const { input, mnemonic } = req.body;
  const raw = input || mnemonic;

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== 64) {
      return res.status(400).json({ message: "Chave inválida" });
    }

    const kp = Keypair.fromSecretKey(Uint8Array.from(parsed));
    const pubkey = kp.publicKey.toBase58();
    createSession(pubkey, res);

    return res.json({
      walletAddress: pubkey,
      secretKey: Array.from(kp.secretKey),
    });
  } catch {
    return res.status(400).json({ message: "Formato inválido (esperado: JSON array com 64 bytes)" });
  }
});

// 🔐 Retorna sessão
app.get("/session/me", (req, res) => {
  const session = getSession(req);
  if (!session) {
    return res.json({ ok: false });
  }
  return res.json({ ok: true, user: { walletPubkey: session.walletPubkey } });
});

// 💰 Retorna saldo
app.post("/user/balance", async (req, res) => {
  const { userPubkey } = req.body;

  if (!userPubkey) {
    return res.status(400).json({ message: "userPubkey é obrigatório" });
  }

  try {
    const pubkey = new PublicKey(userPubkey);
    const lamports = await connection.getBalance(pubkey);
    const sol = lamports / 1e9;
    return res.json({ balance: sol });
  } catch (err) {
    console.error("Erro ao buscar saldo:", err.message);
    return res.status(400).json({ message: "Erro ao buscar saldo" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ API Wallet rodando em http://localhost:${PORT}`);
});
