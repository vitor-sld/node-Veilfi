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

const isProd = process.env.NODE_ENV === "production";

/* =============================================
   BODY PARSE (IMPORTANTE!)
============================================= */
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

/* =============================================
   COOKIES
============================================= */
app.use(cookieParser());

/* =============================================
   CORS (FUNCIONA PROD + LOCAL)
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
   SESSION (FINAL, FUNCIONANDO)
============================================= */
app.use(
  session({
    name: process.env.SESSION_NAME || "sid",
    secret: process.env.SESSION_SECRET || "dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,        // Render usa HTTPS
      sameSite: "none",    // Necessário p/ cookies cross-domain
      domain: "veilfi.space", // ADICIONADO
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

app.get("/", (req, res) => {
  res.send("API OK - Veilfi Backend Running");
});

/* ============================================= */
app.listen(PORT, () =>
  console.log(`🚀 Backend Veilfi rodando na porta ${PORT}`)
);
