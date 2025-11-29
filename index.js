// server/index.js
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/user");
const walletRoutes = require("./routes/wallet");
const { getSession } = require("./sessions");

const app = express();
const PORT = process.env.PORT || 3001;

const isProduction = process.env.NODE_ENV === "production";

// -----------------------------------------------------
// ✅ CORS — ESSENCIAL PARA COOKIES FUNCIONAREM NO RENDER
// -----------------------------------------------------
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "https://veilfi-vite.onrender.com",
    ],
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

// Preflight global
app.options("*", cors());

// Middlewares essenciais
app.use(express.json());
app.use(cookieParser());

// -----------------------------------------------------
// Middleware para vincular sessão automaticamente
// -----------------------------------------------------
const { getSession: getSessionFromCookie } = require("./sessions");

app.use((req, res, next) => {
  const sess = getSessionFromCookie(req);
  if (sess) req.sessionObject = sess;
  next();
});

// -----------------------------------------------------
// Rotas principais
// -----------------------------------------------------
app.use("/auth", authRoutes);     // Import wallet / login
app.use("/user", userRoutes);     // Balance (/user/balance)
app.use("/wallet", walletRoutes); // Payment (/wallet/send, /wallet/balance)

// -----------------------------------------------------
// Checagem rápida da API
// -----------------------------------------------------
app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "API VeilFi rodando",
    env: process.env.NODE_ENV,
  });
});

// -----------------------------------------------------
// Start
// -----------------------------------------------------
app.listen(PORT, () => {
  console.log(`🔥 API rodando na porta ${PORT} (production=${isProduction})`);
});
