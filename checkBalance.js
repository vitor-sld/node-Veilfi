import dotenv from "dotenv";
dotenv.config();

import { Connection, PublicKey } from "@solana/web3.js";

async function checkBalance() {
  const connection = new Connection(process.env.RPC_URL, "confirmed");
  const pub = new PublicKey(process.env.PUBLIC_KEY);

  const lamports = await connection.getBalance(pub);
  console.log("💰 Hot Wallet Balance:", lamports / 1e9, "SOL");
}

checkBalance();
