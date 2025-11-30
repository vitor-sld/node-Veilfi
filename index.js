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
   BASIC MIDDLEWARES
============================================= */
app.use(express.json());
app.use(cookieParser());

/* =============================================
   CORS
============================================= */
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://node-veilfi-jtae.onrender.com",
      process.env.FRONTEND_ORIGIN
    ].filter(Boolean),
    credentials: true,
  })
);

/* =============================================
   EXPRESS-SESSION
============================================= */
app.use(
  session({
    name: "sid",
    secret: process.env.SESSION_SECRET || "dev-secret",
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
   req.sessionObject (compat)
============================================= */
app.use((req, res, next) => {
  req.sessionObject = req.session.sessionObject || null;
  next();
});

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
