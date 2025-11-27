const fetch = require("node-fetch");
const { Connection, VersionedTransaction } = require("@solana/web3.js");

const JUPITER_SWAP_URL = "https://quote-api.jup.ag/v6";
const RPC = process.env.RPC_URL;
const connection = new Connection(RPC, "confirmed");

// Recebe inputMint, outputMint e amount em UI (ex: 1.5 tokens)
async function createSwapTx({ inputMint, outputMint, amountUI, userPubkey }) {
  try {
    console.log("🔵 Jupiter swap request:", { inputMint, outputMint, amountUI });

    // 1) pegar quote
    const quoteRes = await fetch(
      `${JUPITER_SWAP_URL}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountUI}&slippageBps=100`
    );

    const quote = await quoteRes.json();
    console.log("📘 Jupiter quote:", quote);

    // 2) construir TX
    const swapRes = await fetch(`${JUPITER_SWAP_URL}/swap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quote,
        userPublicKey: userPubkey,
        wrapAndUnwrapSol: true,
      }),
    });

    const { swapTransaction } = await swapRes.json();

    console.log("📗 Swap TX received (base64)");

    // 3) decode
    const txBuffer = Buffer.from(swapTransaction, "base64");
    const tx = VersionedTransaction.deserialize(txBuffer);

    return tx;

  } catch (err) {
    console.error("❌ Jupiter swap error:", err);
    throw err;
  }
}

module.exports = { createSwapTx };
