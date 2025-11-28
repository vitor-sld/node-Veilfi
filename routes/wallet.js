// server/routes/wallet.js
const express = require("express");
const router = express.Router();
const { sendSOL } = require("../controllers/walletController");

router.post("/send", sendSOL);

module.exports = router;
