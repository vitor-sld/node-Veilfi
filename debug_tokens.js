// server/debug_tokens.js
require("dotenv").config();
const { Connection, PublicKey } = require("@solana/web3.js");

const RPC = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
const connection = new Connection(RPC, "confirmed");

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqZEWHy2LJjWCVzno7pBzuQ42v9oGwLz");

function bufFromMaybeBase64(data) {
  // web3 sometimes returns Buffer, sometimes [base64, 'base64'] shape
  if (!data) return null;
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data) && typeof data[0] === "string") {
    return Buffer.from(data[0], "base64");
  }
  if (typeof data === "string") {
    return Buffer.from(data, "base64");
  }
  return null;
}

function readTokenAccountFromBuffer(buf) {
  // token account layout: mint(32) owner(32) amount(u64) at offset 64
  if (!buf || buf.length < 72) return null;
  const mintBuf = buf.slice(0, 32);
  const ownerBuf = buf.slice(32, 64);
  // amount is u64 little endian at offset 64
  let amount = 0n;
  try {
    amount = buf.readBigUInt64LE(64);
  } catch (e) {
    // fallback for smaller buffers
    amount = 0n;
  }
  return {
    mint: new PublicKey(mintBuf).toBase58(),
    owner: new PublicKey(ownerBuf).toBase58(),
    amount: amount.toString(),
  };
}

async function main() {
  const pubkeyArg = process.argv[2] || process.env.DEBUG_PUBKEY;
  if (!pubkeyArg) {
    console.error("Usage: node debug_tokens.js <pubkey>");
    process.exit(1);
  }
  const owner = new PublicKey(pubkeyArg);
  console.log("RPC:", RPC);
  console.log("Owner:", owner.toBase58());
  console.log("----- parsed (Tokenkeg) -----");
  try {
    const parsed = await connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID });
    console.log("parsed count (Tokenkeg):", parsed.value.length);
    for (const v of parsed.value) {
      const info = v.account.data.parsed?.info;
      if (info) {
        console.log({
          ata: v.pubkey.toBase58(),
          program: v.account.owner.toBase58(),
          mint: info.mint,
          decimals: info.tokenAmount.decimals,
          amountRaw: info.tokenAmount.amount,
          uiAmount: info.tokenAmount.uiAmount
        });
      } else {
        console.log("parsed but no info:", v.pubkey.toBase58());
      }
    }
  } catch (e) {
    console.error("error parsed Tokenkeg:", e.message || e);
  }

  console.log("\n----- parsed (Token-2022) -----");
  try {
    const parsed2022 = await connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID });
    console.log("parsed count (Token-2022):", parsed2022.value.length);
    for (const v of parsed2022.value) {
      const info = v.account.data.parsed?.info;
      if (info) {
        console.log({
          ata: v.pubkey.toBase58(),
          program: v.account.owner.toBase58(),
          mint: info.mint,
          decimals: info.tokenAmount.decimals,
          amountRaw: info.tokenAmount.amount,
          uiAmount: info.tokenAmount.uiAmount
        });
      } else {
        console.log("parsed2022 but no info:", v.pubkey.toBase58());
      }
    }
  } catch (e) {
    console.error("error parsed Token-2022:", e.message || e);
  }

  console.log("\n----- raw (all token accounts, no program filter) -----");
  try {
    const all = await connection.getTokenAccountsByOwner(owner, {});
    console.log("raw token account count:", all.value.length);
    for (const v of all.value) {
      const ata = v.pubkey.toBase58();
      const programId = v.account.owner.toBase58();
      const dataBuf = bufFromMaybeBase64(v.account.data);
      const parsed = readTokenAccountFromBuffer(dataBuf);
      console.log({
        ata,
        programId,
        mint: parsed?.mint,
        owner: parsed?.owner,
        amountRaw: parsed?.amount,
        dataLen: dataBuf ? dataBuf.length : null,
      });
    }
  } catch (e) {
    console.error("error raw:", e.message || e);
  }

  console.log("\n----- done -----");
  process.exit(0);
}

main();
