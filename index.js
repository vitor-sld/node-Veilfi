const express = require("express");
const cors = require("cors");
const swapRouter = require("./routes/swap");

const app = express();

app.use(cors({
  origin: "http://localhost:5173",
  credentials: true
}));

app.use(express.json());
app.use("/swap", swapRouter);

// rotas
const authRouter = require("./routes/auth");
const sessionRouter = require("./routes/session");
const userRouter = require("./routes/user");

// usar rotas (NÃO integrar mais manualmente)
app.use("/auth", authRouter);
app.use("/session", sessionRouter);
app.use("/user", userRouter);

app.listen(3001, () => console.log("🔥 Backend rodando na porta 3001"));
