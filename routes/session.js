const express = require("express");
const router = express.Router();
const { getUser } = require("../sessionMemory");

router.get("/me", (req, res) => {
  const user = getUser();
  console.log("ℹ️ Session pedida. Existe?", !!user);
  if (!user) return res.status(404).json({ error: "No session" });

  return res.json({ user });
});

module.exports = router;
