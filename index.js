// server/server.js
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const authRoutes = require("./routes/auth");
const walletRoutes = require("./routes/wallet");
const userRoutes = require("./routes/user");
const sessionRoutes = require("./routes/session");
const swapRoutes = require("./routes/swap");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(cookieParser());

app.use(
  cors({
    origin: [
      "https://veilfi.space",     // SEU DOMÍNIO REAL
      "http://localhost:5173",    // desenvolvimento
      "http://localhost:5174",
    ],
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

app.options("*", cors());

// ROTAS
app.use("/auth", authRoutes);
app.use("/wallet", walletRoutes);
app.use("/user", userRoutes);
app.use("/session", sessionRoutes);
app.use("/swap", swapRoutes); // swap funcionando

app.get("/", (req, res) => res.send("API OK"));

app.listen(PORT, () => console.log("API ON PORT", PORT));
