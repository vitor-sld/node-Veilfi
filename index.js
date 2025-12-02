// index.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const session = require("express-session");

// Rotas
const authRoutes = require("./routes/auth");
const walletRoutes = require("./routes/wallet");
const userRoutes = require("./routes/user");
const sessionRoutes = require("./routes/session");
const swapRoutes = require("./routes/swap");   //  👈 ROTA DO SWAP

const app = express();
const PORT = process.env.PORT || 3001;

/* =============================================
   BODY PARSER
============================================= */
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

/* =============================================
   COOKIES
============================================= */
app.use(cookieParser());

/* =============================================
   CORS
============================================= */
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://veilfi.space",
      process.env.FRONTEND_ORIGIN,
    ].filter(Boolean),
    credentials: true,
  })
);

/* =============================================
   TRUST PROXY — NECESSÁRIO NA RENDER
============================================= */
app.set("trust proxy", 1);

/* =============================================
   SESSION
============================================= */
app.use(
  session({
    name: process.env.SESSION_NAME || "sid",
    secret: process.env.SESSION_SECRET || "dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,         // precisa ser HTTPS (Render usa)
      sameSite: "none",     // para permitir cookies cross-domain
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

/* =============================================
   ROTAS
============================================= */
app.use("/auth", authRoutes);
app.use("/wallet", walletRoutes);
app.use("/user", userRoutes);
app.use("/session", sessionRoutes);
app.use("/swap", swapRoutes);  //  👈 AQUI SEU SWAP ESTÁ ATIVO

app.get("/", (req, res) => {
  res.send("API OK - Veilfi Backend Running");
});

/* =============================================
   SERVIDOR
============================================= */
app.listen(PORT, () => {
  console.log(`🚀 Backend Veilfi rodando na porta ${PORT}`);
});
