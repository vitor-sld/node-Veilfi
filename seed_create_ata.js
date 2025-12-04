// seed_create_ata.js
// Uso: node seed_create_ata.js
// Lê seed.txt (local), gera owner.json (Uint8Array), cria ATA para CUSTOM_MINT e apaga seed.txt (opcional).

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const bip39 = require('bip39');
const ed25519 = require('ed25519-hd-key'); // npm i ed25519-hd-key
const { Keypair, Connection, PublicKey } = require('@solana/web3.js');
const { getOrCreateAssociatedTokenAccount } = require('@solana/spl-token');

const RPC = process.env.RPC_URL || 'https://frequent-soft-daylight.solana-mainnet.quiknode.pro/db097341fa55b3a5bf3e5d96776910263c3a492a/';

// CONFIG: altere se quiser
const SEED_FILE = path.join(__dirname, 'seed.txt'); // put your seed here (local)
const OWNER_JSON = path.join(__dirname, 'owner.json');
const CUSTOM_MINT = process.env.CUSTOM_MINT || '7CVaSUZJanCjcK3jZc87eF2iQkcesDF7c98titi8pump';
const TARGET_OWNER_PUBKEY = process.env.TARGET_OWNER_PUBKEY || '8R1SU9DGhaxwHU6ZnHLDNuN3ymdz84VCUHJPs1k7TLLb';
// set DELETE_SEED=true in .env to remove seed.txt after success
const DELETE_SEED = (process.env.DELETE_SEED === 'true');

async function main() {
  if (!fs.existsSync(SEED_FILE)) {
    console.error('Arquivo seed.txt não encontrado. Crie seed.txt com sua seed (local).');
    process.exit(1);
  }

  const seedWords = fs.readFileSync(SEED_FILE, 'utf8').trim();
  if (!seedWords || seedWords.split(/\s+/).length < 12) {
    console.error('Seed inválida no seed.txt. Verifique o conteúdo (12 ou 24 palavras).');
    process.exit(1);
  }

  // 1) derive seed -> secret key (ed25519 derivation m/44'/501'/0'/0')
  console.log('Gerando keypair a partir da seed (local)...');
  const seedBuffer = await bip39.mnemonicToSeed(seedWords); // Buffer 64 bytes
  const derived = ed25519.derivePath("m/44'/501'/0'/0'", seedBuffer.toString('hex')).key; // 32 bytes
  const keypair = Keypair.fromSeed(derived);

  // 2) write owner.json (Uint8Array)
  const arr = Array.from(keypair.secretKey);
  fs.writeFileSync(OWNER_JSON, JSON.stringify(arr), { encoding: 'utf8', flag: 'w' });
  console.log('owner.json criado (local):', OWNER_JSON);
  console.log('Public key:', keypair.publicKey.toBase58());

  // 3) create ATA
  console.log('Conectando ao RPC:', RPC);
  const connection = new Connection(RPC, 'confirmed');

  try {
    const ata = await getOrCreateAssociatedTokenAccount(
      connection,
      keypair,                      // payer
      new PublicKey(CUSTOM_MINT),   // mint
      new PublicKey(TARGET_OWNER_PUBKEY) // owner of ATA (destino)
    );

    console.log('✅ ATA criada: ', ata.address.toBase58());
  } catch (err) {
    console.error('Falha ao criar ATA:', err.message || err);
    process.exit(1);
  }

  if (DELETE_SEED) {
    try {
      fs.unlinkSync(SEED_FILE);
      console.log('seed.txt removido (DELETE_SEED=true).');
    } catch (e) {
      console.warn('Não foi possível apagar seed.txt:', e.message || e);
    }
  } else {
    console.log('seed.txt mantido (para segurança, apague-o manualmente depois).');
  }

  console.log('Pronto — verifique sua carteira / test.js novamente.');
}

main().catch(e => {
  console.error('Erro fatal:', e);
  process.exit(1);
});
