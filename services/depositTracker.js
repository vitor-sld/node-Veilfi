// 📁 DEV/services/depositTracker.js
// Observa e detecta depósitos na wallet da empresa (mainnet)

import dotenv from "dotenv";
dotenv.config();

import {
  Connection,
  PublicKey
} from "@solana/web3.js";

const RPC_URL = process.env.RPC_URL;
const connection = new Connection(RPC_URL, "confirmed");

let lastCheckedSignatures = new Set(); // evita dupla contagem

export async function checkDeposits() {
  try {
    const walletPubkey = new PublicKey(process.env.PUBLIC_KEY);

    // Fetch últimas 20 transações
    const signatures = await connection.getSignaturesForAddress(walletPubkey, {
      limit: 20
    });

    let newDeposits = [];

    for (const sig of signatures) {
      if (lastCheckedSignatures.has(sig.signature)) {
        continue; // já processada
      }

      lastCheckedSignatures.add(sig.signature);

      // Obtém detalhes da transação
      const tx = await connection.getTransaction(sig.signature, {
        maxSupportedTransactionVersion: 0
      });

      if (!tx) continue;

      // Quantidade recebida em SOL?
      const pre = tx.meta?.preBalances;
      const post = tx.meta?.postBalances;

      if (!pre || !post) continue;

      // se postBalance > preBalance → depósito de SOL
      const diff = post[0] - pre[0];

      if (diff > 0) {
        newDeposits.push({
          signature: sig.signature,
          amountLamports: diff,
          amountSol: diff / 1e9,
          timestamp: sig.blockTime,
          explorer: `https://explorer.solana.com/tx/${sig.signature}?cluster=mainnet`
        });
      }
    }

    return newDeposits;
  } catch (err) {
    console.error("Deposit tracker error:", err);
    return [];
  }
}
