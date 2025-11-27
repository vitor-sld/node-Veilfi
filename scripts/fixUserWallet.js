const db = require("../db");

async function run() {
  // coloque o ID do usuário logado
  const userId = 1;

  // carteira solana correta
  const solWallet = "8R1SU9DGhaxwHU6ZnHLDNuN3ymdz84VCUHJPs1k7TLLb";

  await db.user.update({
    where: { id: userId },
    data: { walletPubkey: solWallet }
  });

  console.log("OK: Wallet corrigida");
}

run();
