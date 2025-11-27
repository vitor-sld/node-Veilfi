const path = require("path");
const dotenv = require("dotenv");

dotenv.config({
    path: path.resolve(__dirname, "../.env")
});

console.log("✔️ ENV carregado:");
console.log("RPC_URL =", process.env.RPC_URL ? "[set]" : "[NOT SET]");
console.log("JUP_BASE =", process.env.JUP_BASE ? "[set]" : "[NOT SET]");

module.exports = process.env;
