const express = require("express");
const cors = require("cors");
const app = express();

app.use(cors({
  origin: "http://localhost:5173",
  credentials: true
}));

app.use(express.json());

// Rotas existentes
app.use("/auth", require("./routes/auth"));
app.use("/session", require("./routes/session"));
app.use("/user", require("./routes/user"));

// ⬅️ ESTA É A ROTA QUE VOCÊ ACABOU DE CRIAR
app.use("/wallet", require("./routes/wallet"));

app.listen(3001, () => console.log("🔥 Backend rodando na porta 3001"));
