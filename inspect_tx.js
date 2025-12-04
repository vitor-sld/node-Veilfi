require("dotenv").config();
const { Connection, PublicKey } = require("@solana/web3.js");

const RPC = process.env.RPC_URL;
const WALLET = "8R1SU9DGhaxwHU6ZnHLDNuN3ymdz84VCUHJPs1k7TLLb";

// Program IDs
const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");   // SPL normal
const TOKEN_2022_PROGRAM = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"); // Token-2022 (pump.fun)

// Mint custom
const CUSTOM_MINT = "7CVaSUZJanCjcK3jZc87eF2iQkcesDF7c98titi8pump";

(async () => {
  console.log("RPC =", RPC);
  console.log("Carteira =", WALLET);

  const connection = new Connection(RPC, "confirmed");
  const owner = new PublicKey(WALLET);

  // 1) SOL BALANCE
  const solLamports = await connection.getBalance(owner);
  const sol = solLamports / 1e9;
  console.log("💰 SOL:", sol);

  const results = [];

  // 2) SPL Normal
  try {
    const spl = await connection.getParsedTokenAccountsByOwner(owner, {
      programId: TOKEN_PROGRAM
    });

    for (const acc of spl.value) {
      const info = acc.account.data.parsed.info;
      const mint = info.mint;
      const amount = info.tokenAmount.uiAmount;
      const decimals = info.tokenAmount.decimals;

      results.push({ mint, amount, decimals, program: "SPL" });
    }
  } catch (e) {
    console.log("ERRO SPL:", e.message);
  }

  // 3) Token-2022 (pump.fun)
  try {
    const t22 = await connection.getParsedTokenAccountsByOwner(owner, {
      programId: TOKEN_2022_PROGRAM
    });

    for (const acc of t22.value) {
      const info = acc.account.data.parsed.info;
      const mint = info.mint;
      const amount = info.tokenAmount.uiAmount;
      const decimals = info.tokenAmount.decimals;

      results.push({ mint, amount, decimals, program: "Token-2022" });
    }
  } catch (e) {
    console.log("❌ ERRO 2022:", e.message);
  }

  // 4) Mostrar resultados
  if (!results.length) {
    console.log("⚠ Nenhum token encontrado.");
  } else {
    console.log("\n🟦 TOKENS ENCONTRADOS:");
    for (const t of results) {
      console.log(`• Mint: ${t.mint}`);
      console.log(`  Programa: ${t.program}`);
      console.log(`  Decimals: ${t.decimals}`);
      console.log(`  Amount:   ${t.amount}\n`);
    }
  }

  console.log("✔ FINALIZADO");
})();
