const express = require("express");
const session = require("express-session");
const cors = require("cors");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({
  path: path.resolve(__dirname, "./.env") // carrega .env da pasta server
});

console.log("✔️ ENV carregado:");
console.log("RPC_URL =", process.env.RPC_URL ? "[set]" : "[NOT SET]");
console.log("JUP_BASE =", process.env.JUP_BASE ? "[set]" : "[NOT SET]");

const app = express();

app.use(express.json());

app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true
  })
);

app.use(
  session({
    secret: "chave_super_segura",
    resave: false,
    saveUninitialized: true
  })
);

// Rotas
app.use("/auth", require("./routes/auth"));
app.use("/session", require("./routes/session"));
app.use("/wallet", require("./routes/wallet"));
app.use("/swap/buy", require("./routes/buy"));

app.listen(3001, () => console.log("Servidor rodando na porta 3001"));
