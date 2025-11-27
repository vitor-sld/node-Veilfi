const { Keypair } = require("@solana/web3.js");

async function login(req, res) {
  const { email, password } = req.body;

  const user = await db.user.findUnique({ where: { email } });
  if (!user) return res.status(400).json({ error: "User not found" });

  // SENHA OK?
  if (user.password !== password) {
    return res.status(401).json({ error: "Invalid password" });
  }

  // 🔥 SE O USUÁRIO NÃO TIVER WALLET → CRIA AGORA!
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

  return res.json({
    user: {
      id: user.id,
      email: user.email,
      walletPubkey: user.walletPubkey,
    },
  });
}

module.exports = { login };
