// -----------------------------
// 📌 Veilfi Backend - MAINNET
// Node 22 + Express + ES Modules
// -----------------------------

import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";

// Rotas
import withdrawRoutes from "./routes/withdraw.js";
import depositRoutes from "./routes/deposit.js";

// Deposit Tracker
import { checkDeposits } from "./services/depositTracker.js";

const app = express();

// -----------------------------
// 💠 Middlewares
// -----------------------------
app.use(cors());
app.use(express.json());

// -----------------------------
// 🔵 Routes
// -----------------------------
app.use("/withdraw", withdrawRoutes);
app.use("/deposit", depositRoutes);

// -----------------------------
// 🔄 Deposit Tracking Loop
// -----------------------------
setInterval(async () => {
  try {
    const newDeposits = await checkDeposits();
    if (newDeposits.length > 0) {
      console.log("💰 New deposits detected:", newDeposits);
    }
  } catch (error) {
    console.error("❌ depositTracker error:", error);
  }
}, 15000); // 15 seconds

// -----------------------------
// 🧪 Health Check
// -----------------------------
app.get("/", (_, res) => {
  res.send("API Online - Veilfi Backend MAINNET 🚀");
});

// -----------------------------
// 🚀 Start Server
// -----------------------------
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
  console.log("RPC:", process.env.RPC_URL);
});
