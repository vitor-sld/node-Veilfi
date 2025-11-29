// server/server.js
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const authRoutes = require("./routes/auth");
const walletRoutes = require("./routes/wallet");
const userRoutes = require("./routes/user");

const { getSession } = require("./sessions");

const app = express();
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === "production";

/* ---------------------- CORS CONFIG ---------------------- */
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://veifi-vite.onrender.com",
    ],
    credentials: true,
    allowedHeaders: ["Content-Type"],
    methods: ["GET", "POST", "OPTIONS"],
  })
);

// Preflight global:
app.options("*", cors());

app.use(express.json());
app.use(cookieParser());

/* ---------------------- SESSION MIDDLEWARE ---------------------- */
app.use((req, res, next) => {
  req.sessionObject = getSession(req);
  next();
});

/* ---------------------- ROUTES ---------------------- */
app.use("/auth", authRoutes);
app.use("/wallet", walletRoutes);
app.use("/user", userRoutes);

/* ---------------------- HEALTH ---------------------- */
app.get("/", (req, res) => res.send("API Veilfi OK"));

/* ---------------------- START ---------------------- */
app.listen(PORT, () => {
  console.log(`🚀 API running on port ${PORT} — prod=${isProd}`);
});
