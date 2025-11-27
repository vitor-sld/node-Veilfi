// server/services/swap.js
// Node backend: price lookup + swap execution (local swap using treasury)
const fetch = require("node-fetch");
const { Connection, Keypair, PublicKey, Transaction, SystemProgram } = require("@solana/web3.js");
const splToken = require("@solana/spl-token");

const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
const PUMP_MINT = process.env.PUMP_TOKEN_MINT;
const USDT_MINT = process.env.USDT_MINT;
const BIRDEYE_PRICE_URL = process.env.BIRDEYE_PRICE_URL || "https://public-api.birdeye.so/public/price?address=";
const FALLBACK_SOL_TO_PUMP_RATE = Number(process.env.FALLBACK_SOL_TO_PUMP_RATE || 10000);

const connection = new Connection(RPC_URL, { commitment: "confirmed" });

function parseSecretKey(secret) {
  if (!secret) throw new Error("TREASURY_SECRET not set");
  try {
    // if it's JSON array
    if (secret.trim().startsWith("[")) {
      const arr = JSON.parse(secret);
      return Uint8Array.from(arr);
    }
    // if it's base58 string, try decode with bs58
    const bs58 = require("bs58");
    return bs58.decode(secret);
  } catch (e) {
    throw new Error("Invalid treasury secret format");
  }
}

// load treasury Keypair once
let treasuryKeypair = null;
if (process.env.TREASURY_SECRET) {
  const sk = parseSecretKey(process.env.TREASURY_SECRET);
  treasuryKeypair = Keypair.fromSecretKey(sk);
} else {
  console.warn("TREASURY_SECRET is not set. /swap/execute will fail.");
}

async function getPriceFromBirdeye(mint) {
  try {
    const url = `${BIRDEYE_PRICE_URL}${encodeURIComponent(mint)}`;
    const res = await fetch(url, { timeout: 10000 });
    if (!res.ok) throw new Error(`Birdeye ${res.status}`);
    const json = await res.json();
    if (json?.data?.value) {
      return Number(json.data.value); // price in USD
    }
    throw new Error("No price data");
  } catch (err) {
    console.warn("getPriceFromBirdeye failed:", err.message);
    return null;
  }
}

/**
 * Quote: returns output amount for given input token and input amount
 * - inputToken: "SOL" or "USDT"
 * - inputAmount: number (SOL in SOL units; USDT in USDT units)
 * returns: { outputAmount, priceInfo }
 */
async function quoteSwapLocal({ inputToken, inputAmount }) {
  // fetch USD prices
  const solPrice = await getPriceFromBirdeye("So11111111111111111111111111111111111111112");
  const pumpPrice = await getPriceFromBirdeye(PUMP_MINT);

  // fallback if prices missing
  if (!pumpPrice) {
    // if pump price not present, we can compute via fallback rate for SOL->PUMP
    if (inputToken === "SOL") {
      const output = inputAmount * FALLBACK_SOL_TO_PUMP_RATE;
      return {
        outputAmount: Math.floor(output),
        priceSource: "fallback-rate",
        pumpPrice: null,
        solPrice: solPrice || null,
      };
    }
    throw new Error("Pump price unavailable");
  }

  // Use USD conversions
  if (inputToken === "SOL") {
    if (!solPrice) throw new Error("SOL price unavailable");
    // inputAmount SOL -> USD -> number of pump tokens
    const usd = inputAmount * solPrice;
    const outputAmount = usd / pumpPrice;
    return {
      outputAmount: Math.floor(outputAmount),
      priceSource: "birdeye-usd",
      pumpPrice,
      solPrice,
    };
  } else if (inputToken === "USDT") {
    // inputAmount USDT -> USD -> pump
    const usd = inputAmount;
    const outputAmount = usd / pumpPrice;
    return {
      outputAmount: Math.floor(outputAmount),
      priceSource: "birdeye-usd",
      pumpPrice,
      solPrice,
    };
  } else {
    throw new Error("Unsupported input token");
  }
}

/**
 * Execute swap: user pays SOL or USDT (on-chain or off-chain) and server sends pump token from treasury to user.
 * For simplicity this implementation assumes user already sent SOL/USDT to the treasury or that the app handles payment off-chain.
 * We'll implement the on-chain transfer from treasury -> user's associated token account.
 */
async function executeSwapLocal({ userPubkey, outputAmount }) {
  if (!treasuryKeypair) throw new Error("Treasury key not configured");
  if (!PUMP_MINT) throw new Error("PUMP_TOKEN_MINT not set");

  const payer = treasuryKeypair;
  const connectionLocal = connection;
  const pumpMintPubkey = new PublicKey(PUMP_MINT);
  const userPub = new PublicKey(userPubkey);

  // derive associated token accounts
  const treasuryTokenAccount = await splToken.getOrCreateAssociatedTokenAccount(
    connectionLocal,
    payer,
    pumpMintPubkey,
    payer.publicKey
  );

  const userTokenAccount = await splToken.getOrCreateAssociatedTokenAccount(
    connectionLocal,
    payer,
    pumpMintPubkey,
    userPub
  );

  // create transfer instruction
  const tx = new Transaction().add(
    splToken.createTransferInstruction(
      treasuryTokenAccount.address,
      userTokenAccount.address,
      payer.publicKey,
      BigInt(outputAmount * (10 ** 0)), // assumes pump token decimals = 0; adjust if needed
      [],
      splToken.TOKEN_PROGRAM_ID
    )
  );

  // Sign & send
  const sig = await connectionLocal.sendTransaction(tx, [payer], { skipPreflight: false, preflightCommitment: "confirmed" });
  await connectionLocal.confirmTransaction(sig, "confirmed");

  return sig;
}

module.exports = {
  quoteSwapLocal,
  executeSwapLocal,
};
