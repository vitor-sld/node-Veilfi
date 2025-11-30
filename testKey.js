const bs58 = require("bs58");

const base58key = "";

const decoded = bs58.decode(base58key);

console.log("Chave privada em formato array:");
console.log(JSON.stringify(Array.from(decoded)));
