// server/routes/auth.js
const express = require("express");
const router = express.Router();
const { importWallet } = require("../controllers/authController");

router.post("/import", importWallet);

module.exports = router;
