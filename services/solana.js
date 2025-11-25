// server/services/solana.js
const crypto = require("crypto");
const { Connection, PublicKey, Keypair } = require("@solana/web3.js");
const { getOrCreateAssociatedTokenAccount, createTransferInstruction, TOKEN_PROGRAM_ID, getAccount } = require("@solana/spl-token");

const connection = new Connection(process.env.RPC_URL, "confirmed");

/**
 * Criptografa a private key com AES-256-GCM
 */
function encryptPrivateKey(secretKey, passphrase) {
  const iv = crypto.randomBytes(12);
  const salt = crypto.randomBytes(16);

  const key = crypto.pbkdf2Sync(passphrase, salt, 100000, 32, "sha256");

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(secretKey), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    salt: salt.toString("base64"),
    tag: tag.toString("base64"),
  };
}

/**
 * Descriptografa private key
 */
function decryptPrivateKey(ciphertextB64, ivB64, saltB64, passphrase) {
  const ciphertext = Buffer.from(ciphertextB64, "base64");
  const iv = Buffer.from(ivB64, "base64");
  const salt = Buffer.from(saltB64, "base64");

  const key = crypto.pbkdf2Sync(passphrase, salt, 100000, 32, "sha256");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted; // Buffer (secretKey)
}

/**
 * Lê saldo SOL
 */
async function getBalance(pubkey) {
  try {
    const lamports = await connection.getBalance(new PublicKey(pubkey));
    return lamports / 1e9;
  } catch (e) {
    console.error("getBalance error:", e);
    return 0;
  }
}

/**
 * Tenta obter contas token "parsed" para Tokenkeg e Token-2022.
 * Se falhar (Pump.fun / extensões), faz fallback para leitura RAW
 * usando getTokenAccountsByOwner e decodificação manual.
 */
async function getTokens(pubkey) {
  try {
    const owner = new PublicKey(pubkey);

    // Primeiro tenta parsed Tokenkeg (padrão SPL)
    try {
      const parsed = await connection.getParsedTokenAccountsByOwner(owner, {
        programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
      });

      const tokensKeg = parsed.value
        .map((v) => v.account.data.parsed && v.account.data.parsed.info)
        .filter(Boolean)
        .map((info) => ({
          mint: info.mint,
          amount: info.tokenAmount.amount,
          decimals: info.tokenAmount.decimals,
          uiAmount: info.tokenAmount.uiAmount,
          ata: null,
        }))
        .filter((t) => Number(t.amount) > 0);

      if (tokensKeg.length > 0) return tokensKeg;
    } catch (e) {
      // não fatal, tenta outras abordagens
      // console.debug("parsed Tokenkeg failed:", e.message || e);
    }

    // Tenta parsed Token-2022
    try {
      const parsed2022 = await connection.getParsedTokenAccountsByOwner(owner, {
        programId: new PublicKey("TokenzQdBNbLqZEWHy2LJjWCVzno7pBzuQ42v9oGwLz"),
      });

      const tokens2022 = parsed2022.value
        .map((v) => v.account.data.parsed && v.account.data.parsed.info)
        .filter(Boolean)
        .map((info) => ({
          mint: info.mint,
          amount: info.tokenAmount.amount,
          decimals: info.tokenAmount.decimals,
          uiAmount: info.tokenAmount.uiAmount,
          ata: null,
        }))
        .filter((t) => Number(t.amount) > 0);

      if (tokens2022.length > 0) return tokens2022;
    } catch (e) {
      // console.debug("parsed Token-2022 failed:", e.message || e);
    }

    // Fallback robusto: listar todas token accounts (sem filtro de programa)
    // e decodificar o buffer da conta token (modo RAW). Isso cobre Pump.fun
    const all = await connection.getTokenAccountsByOwner(owner, {});
    const tokens = [];

    for (const acc of all.value) {
      const data = acc.account.data;
      // data pode vir como [base64, 'base64'] ou Buffer
      let buf;
      if (Array.isArray(data) && typeof data[0] === "string") {
        buf = Buffer.from(data[0], "base64");
      } else if (Buffer.isBuffer(data)) {
        buf = data;
      } else if (typeof data === "string") {
        buf = Buffer.from(data, "base64");
      } else {
        continue;
      }

      // token account layout (base SPL layout):
      // mint: bytes 0..32
      // owner: bytes 32..64
      // amount: u64 little endian at offset 64 (8 bytes)
      if (buf.length < 72) continue;

      const mintBuf = buf.slice(0, 32);
      const amountBuf = buf.slice(64, 72);
      const mint = new PublicKey(mintBuf).toBase58();
      let amount = 0n;
      try {
        amount = amountBuf.readBigUInt64LE(0);
      } catch (e) {
        amount = 0n;
      }

      if (amount > 0n) {
        // uiAmount cannot be computed reliably without knowing decimals; try defaults
        // We'll return amount (base units) and default decimals 6 (Pump.fun typical) for UI.
        tokens.push({
          mint,
          amount: amount.toString(),
          decimals: 6,
          uiAmount: Number(amount) / 10 ** 6,
          ata: acc.pubkey.toBase58(),
          programId: acc.account.owner.toBase58(),
        });
      }
    }

    return tokens;
  } catch (e) {
    console.error("Token fetch error:", e);
    return [];
  }
}

/**
 * Garante que exista a ATA para um mint/owner usando o próprio userKeypair como payer.
 * Retorna o endereço da ATA criada/existente.
 * OBS: o userKeypair precisa TER SOL para pagar a criação.
 */
async function ensureATA(mintAddress, ownerPubkeyBase58, userKeypair) {
  try {
    const mint = new PublicKey(mintAddress);
    const ownerPubkey = new PublicKey(ownerPubkeyBase58);
    // getOrCreateAssociatedTokenAccount usa o payer como primeiro argumento:
    // quando usada com o userKeypair, a própria carteira paga a taxa.
    const ata = await getOrCreateAssociatedTokenAccount(
      connection,
      userKeypair, // payer (user pays)
      mint,
      ownerPubkey
    );

    return ata.address.toBase58();
  } catch (e) {
    // Possíveis causas: insuficiente SOL, invalid mint, etc.
    console.error("ensureATA failed:", e.message || e);
    throw e;
  }
}

/**
 * Cria e envia uma transferência SPL (sender = userKeypair)
 * amountBaseUnits deve ser BigInt ou string com base-units (ex: 1000000 para 1 token com 6 decimais)
 */
async function sendSplToken(userKeypair, mintAddress, destinationPubkey, amountBaseUnits) {
  try {
    const mint = new PublicKey(mintAddress);
    const dest = new PublicKey(destinationPubkey);
    const connectionLocal = connection;

    // garante ATAs (remarcando: usando userKeypair como payer)
    const senderATA = await getOrCreateAssociatedTokenAccount(connectionLocal, userKeypair, mint, userKeypair.publicKey);
    const destATA = await getOrCreateAssociatedTokenAccount(connectionLocal, userKeypair, mint, dest);

    const rawAmount = BigInt(amountBaseUnits);

    const ix = createTransferInstruction(
      senderATA.address,
      destATA.address,
      userKeypair.publicKey,
      rawAmount,
      [],
      TOKEN_PROGRAM_ID
    );

    // assina e envia
    const tx = await connectionLocal.sendTransaction(
      new (require("@solana/web3.js").Transaction)().add(ix),
      [userKeypair],
      { skipPreflight: false, preflightCommitment: "confirmed" }
    );

    // retorna signature (string)
    return tx;
  } catch (e) {
    console.error("sendSplToken error:", e);
    throw e;
  }
}

module.exports = {
  encryptPrivateKey,
  decryptPrivateKey,
  getBalance,
  getTokens,
  ensureATA,
  sendSplToken,
  connection,
};
