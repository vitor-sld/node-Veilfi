// server/server.js
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const authRoutes = require("./routes/auth");
const walletRoutes = require("./routes/wallet");
const userRoutes = require("./routes/user");

const app = express();
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === "production";

console.log("🟦 Running in PROD?", isProd);

/* ---------------------------------------------------
   🔥 CORS — TEM QUE VIR ANTES DE TUDO, ANTES DAS ROTAS
---------------------------------------------------- */
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "https://veifi-vite.onrender.com",
    ],
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

// 🔥 ESSA LINHA É OBRIGATÓRIA PARA O PRE-FLIGHT FUNCIONAR
app.options("*", cors());

/* --------------------------------------------------- */
app.use(express.json());
app.use(cookieParser());

/* --------------------------------------------------- */
app.use("/auth", authRoutes);
app.use("/wallet", walletRoutes);
app.use("/user", userRoutes);

/* --------------------------------------------------- */
app.get("/", (req, res) => res.send("API OK"));

/* --------------------------------------------------- */
app.listen(PORT, () => {
  console.log(`🚀 API running at ${PORT}`);
});
