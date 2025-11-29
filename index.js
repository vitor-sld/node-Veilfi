// server/server.js
const express = require("express");
const cookieParser = require("cookie-parser");
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/user");
const walletRoutes = require("./routes/wallet");
const { getSession } = require("./sessions");
const sessionRoutes = require("./routes/session");



const app = express();
const PORT = process.env.PORT || 3001;

// 🎯 Origens permitidas
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "https://veilfi-vite.onrender.com",
  "https://veilfi.com",
];

// 🚨 DEBUG: loga todo request
app.use((req, _, next) => {
  console.log("REQ:", req.method, req.path);
  console.log("ORIGIN:", req.headers.origin);
  console.log("COOKIE:", req.headers.cookie);
  next();
});

// ⭐ CORS COMPLETO
app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  }

  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});
app.use(express.json());
app.use(cookieParser());

// ✨ Sessão
app.use((req, res, next) => {
  const session = getSession(req);
  if (session) {
    console.log("✔ SESSION FOUND:", session.walletPubkey);
  } else {
    console.log("❌ NO SESSION");
  }
  req.sessionObject = session;
  next();
});
app.use("/session", sessionRoutes);

// Rotas
app.use("/auth", authRoutes);
app.use("/user", userRoutes);
app.use("/wallet", walletRoutes);

// Health
app.get("/", (req, res) => res.send("API Veilfi OK"));

// Start
app.listen(PORT, () =>
  console.log(`🚀 Server on ${PORT}`)
);
