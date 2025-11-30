const { Keypair } = require("@solana/web3.js");
const db = require("../db"); // ajuste conforme seu caminho real

async function login(req, res) {
  const { email, password } = req.body;

  // Buscar usuário
  const user = await db.user.findUnique({ where: { email } });
  if (!user) return res.status(400).json({ error: "User not found" });

  // Validar senha
  if (user.password !== password) {
    return res.status(401).json({ error: "Invalid password" });
  }

  // Criar wallet caso não exista
  if (!user.walletPubkey) {
    const kp = Keypair.generate();

    await db.user.update({
      where: { id: user.id },
      data: {
        walletPubkey: kp.publicKey.toBase58(),
        walletSecret: Buffer.from(kp.secretKey).toString("base64"),
      },
    });

    user.walletPubkey = kp.publicKey.toBase58();
  }

  // 🔥 Criar objeto de sessão
  const sessionObject = {
    userId: user.id,
    email: user.email,
    walletAddress: user.walletPubkey,
  };

  // Salvar sessão no cookie
  res.cookie("session", JSON.stringify(sessionObject), {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 dias
  });

  return res.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      walletAddress: user.walletPubkey,
    },
  });
}

module.exports = { login };
