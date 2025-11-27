router.post("/balance", async (req, res) => {
  try {
    const { userPubkey } = req.body;
    const sol = await getSolBalance(userPubkey);
    const tokens = await getAllTokens(userPubkey);

    return res.json({
      wallet: userPubkey,
      solBalance: sol,
      tokens: tokens,
    });
  } catch (err) {
    console.error("❌ balance error:", err);
    return res.status(500).json({ error: "Server error", detail: err.message });
  }
});
