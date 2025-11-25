import { Router } from "express";
import { withdrawSol } from "../services/withdrawSol.js";

const router = Router();

router.post("/sol", withdrawSol);

export default router;
