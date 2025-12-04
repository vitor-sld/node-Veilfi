require("dotenv").config();
const fs = require("fs");
const bip39 = require("@scure/bip39");
const { english } = require("@scure/bip39/wordlists/english");
const nacl = require("tweetnacl");
const bs58 = require("bs58");
const { Keypair } = require("@solana/web3.js");
const { ensureATA } = require("./services/solana");

// -----------------------------
// CONFIG
// -----------------------------
const MINT = "7CVaSUZJanCjcK3jZc87eF2iQkcesDF7c98titi8pump";
const OWNER_PUBKEY = "8R1SU9DGhaxwHU6ZnHLDNuN3ymdz84VCUHJPs1k7TLLb";

// -----------------------------
// FUNÇÃO PARA DETECTAR O TIPO DE CHAVE
// -----------------------------
function loadKeypair() {
  const raw = fs.readFileSync("./owner.txt", "utf8").trim();

  // 1) seed phrase (12 ou 24 palavras)
  if (raw.split(" ").length >= 12) {
    console.log("🔍 Detectado: Seed phrase");
    const seed = bip39.mnemonicToSeedSync(raw); // 64 bytes
    const keypair = nacl.sign.keyPair.fromSeed(seed.slice(0, 32)); // usa os 32 primeiros bytes
    return Keypair.fromSecretKey(keypair.secretKey);
  }

  // 2) Private key em base58
  if (!raw.includes("[") && !raw.includes(",")) {
    console.log("🔍 Detectado: Private key base58");
    const secret = bs58.decode(raw);
    return Keypair.fromSecretKey(secret);
  }

  // 3) JSON array (owner.json colado dentro do txt)
  if (raw.startsWith("[") && raw.endsWith("]")) {
    console.log("🔍 Detectado: JSON array private key");
    const arr = JSON.parse(raw);
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  }

  throw new Error("Formato de chave inválido em owner.txt");
}

// -----------------------------
// MAIN
// -----------------------------
(async () => {
  try {
    const keypair = loadKeypair();

    console.log("🔑 Public key carregada:", keypair.publicKey.toBase58());

    const ata = await ensureATA(MINT, OWNER_PUBKEY, keypair);

    console.log("\n🎉 ATA criada com sucesso!");
    console.log("📍 ATA:", ata);
  } catch (err) {
    console.error("❌ ERRO:", err.message || err);
  }
})();
