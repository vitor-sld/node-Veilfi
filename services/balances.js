router.post("/balance", async (req, res) => {
  try {
    const { userPubkey } = req.body;
    if (!userPubkey) return res.status(400).json({ error: "Missing pubkey" });

    const info = await getSolanaWalletInfo(userPubkey);
    return res.json(info);
  } catch (err) {
    console.error("/user/balance error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});
