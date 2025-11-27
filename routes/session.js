// server/routes/session.js
const express = require("express");
const router = express.Router();
const session = require("../sessionMemory");

// GET /session/me
router.get("/me", (req, res) => {
  return res.json({ user: session.getUser() });
});

// Também expõe a função setUser na instância do router
// para permitir integração no index.js: const sessionRouter = require('./routes/session');
router.setUser = session.setUser;

module.exports = router;
