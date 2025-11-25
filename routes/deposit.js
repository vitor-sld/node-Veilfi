// 📁 DEV/routes/deposit.js

import { Router } from "express";
import { checkDeposits } from "../services/depositTracker.js";

const router = Router();

router.get("/check", async (req, res) => {
  const deposits = await checkDeposits();
  return res.json({ deposits });
});

export default router;
