// index.js
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const session = require("express-session");
require("dotenv").config();

// Rotas
const authRoutes = require("./routes/auth");
const walletRoutes = require("./routes/wallet");
const userRoutes = require("./routes/user");
const sessionRoutes = require("./routes/session");

const app = express();
const PORT = process.env.PORT || 3001;

/* =============================================
   MIDDLEWARES BÁSICOS
============================================= */
app.use(express.json());
app.use(cookieParser());

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
   EXPRESS-SESSION (A ÚNICA SESSÃO DO SISTEMA)
============================================= */
app.use(
  session({
    name: process.env.SESSION_NAME || "sid",
    secret: process.env.SESSION_SECRET || "development-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

/* =============================================
   🚨 REMOVIDO: NÃO USAR MAIS SESSIONOBJECT CUSTOM
   (Isso QUEBRAVA a wallet e deletava a secretKey)
============================================= */
// ❌ REMOVIDO COMPLETAMENTE
// app.use((req, res, next) => {
//   req.sessionObject = req.session.sessionObject || null;
//   next();
// });

/* =============================================
   ROTAS
============================================= */
app.use("/auth", authRoutes);
app.use("/wallet", walletRoutes);
app.use("/user", userRoutes);
app.use("/session", sessionRoutes);

app.get("/", (req, res) => {
  res.send("API OK - Veilfi Backend Running");
});

/* ============================================= */
app.listen(PORT, () => {
  console.log(`🚀 Backend Veilfi rodando na porta ${PORT}`);
});
