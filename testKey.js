const fs = require("fs");
const bs58 = require("bs58");
const bip39 = require("bip39");
const { Keypair } = require("@solana/web3.js");

// Suas 12 palavras
const mnemonic = "theme submit rain left urban kingdom copper child spoil effort teach magic";

async function main() {
  try {
    // Gera o seed a partir do mnemonic
    const seed = await bip39.mnemonicToSeed(mnemonic);

    // Solana usa apenas os 32 primeiros bytes
    const seed32 = seed.slice(0, 32);

    // Cria keypair
    const keypair = Keypair.fromSeed(seed32);

    const publicKey = keypair.publicKey.toBase58();
    const secretKeyBs58 = bs58.encode(keypair.secretKey);

    console.log("=== Carteira gerada com sucesso ===");
    console.log("Public Key:", publicKey);
    console.log("Secret Key (base58):", secretKeyBs58);

    // Salva no arquivo
    const data = {
      publicKey,
      secretKey_base58: secretKeyBs58,
      secretKey_array: Array.from(keypair.secretKey),
    };

    fs.writeFileSync("site_wallet.json", JSON.stringify(data, null, 2));
    console.log("\nArquivo salvo: site_wallet.json\n");

  } catch (err) {
    console.error("Erro ao gerar chave:", err);
  }
}

main();
