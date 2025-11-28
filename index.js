// server/server.js
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");

const { createSession, getSession } = require("./sessions");

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/user");
const walletRoutes = require("./routes/wallet");

const app = express();
const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === "production";

// configurar CORS
app.use(
  cors({
    origin: (origin, cb) => {
      // permitir requisições sem origin (tools) ou dos nossos frontends
      const allowed = [
        "http://localhost:5173",
        "http://localhost:5174",
        "https://seu-site-frontend.onrender.com", // ajuste se necessário
      ];
      if (!origin) return cb(null, true);
      if (allowed.indexOf(origin) !== -1 || isProduction) return cb(null, true);
      cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

// aceitar preflight global
app.options("*", cors());

app.use(express.json());
app.use(cookieParser());

// middleware para popular req.sessionObject a partir do cookie sid
app.use((req, res, next) => {
  const sess = getSession(req);
  if (sess) req.sessionObject = sess;
  next();
});

// rotas
app.use("/auth", authRoutes);
app.use("/user", userRoutes);
app.use("/wallet", walletRoutes);

// rota health
app.get("/", (req, res) => res.send("API Veilfi OK"));

// start
app.listen(PORT, () => {
  console.log(`API rodando em :${PORT} — production=${isProduction}`);
});
