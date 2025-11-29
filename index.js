// server/server.js
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const authRoutes = require("./routes/auth");
const walletRoutes = require("./routes/wallet");
const userRoutes = require("./routes/user");
const sessionRoutes = require("./routes/session");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(cookieParser());

app.use(
  cors({
    origin: [
      "https://veilfi.space",
      "http://localhost:5173",
      "http://localhost:5174",
      "https://veifi-vite.onrender.com",
      "https://veifi.onrender.com",

    ],
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

app.options("*", cors());

// rotas
app.use("/auth", authRoutes);
app.use("/wallet", walletRoutes);
app.use("/user", userRoutes);
app.use("/session", sessionRoutes)
app.get("/", (req, res) => res.send("API OK"));

app.listen(PORT, () => console.log("API ON PORT", PORT));
