// server/routes/user.ts
import { Router, Request, Response } from "express";
import { Connection, PublicKey } from "@solana/web3.js";

const router = Router();

const RPC_URL = process.env.RPC_URL;

/**
 * GET /user/me
 * Retorna os dados de sessão salvos no cookie
 */
router.get("/me", (req: Request, res: Response) => {
  const sessionObj = (req as any).sessionObject;

  if (!sessionObj) {
    return res.json({ ok: false });
  }

  return res.json({
    ok: true,
    user: sessionObj,
  });
});

/**
 * POST /user/balance
 * Retorna o saldo SOL da wallet do usuário
 */
router.post("/balance", async (req: Request, res: Response) => {
  try {
    const { userPubkey } = req.body;

    if (!userPubkey) {
      return res.status(400).json({ error: "Missing userPubkey" });
    }

    if (!RPC_URL) {
      return res.status(500).json({ error: "Missing RPC_URL in .env" });
    }

    const pubkey = new PublicKey(userPubkey);
    const connection = new Connection(RPC_URL, "confirmed");

    const lamports = await connection.getBalance(pubkey);
    const sol = lamports / 1_000_000_000;

    return res.json({ balance: sol });
  } catch (err) {
    console.error("Balance error:", err);
    return res.status(500).json({ error: "Failed to fetch balance" });
  }
});

export default router;
