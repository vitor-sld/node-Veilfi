router.get("/me", (req, res) => {
  try {
    const session = getSession(req);

    if (!session) {
      return res.json({ ok: false });
    }

    return res.json({
      ok: true,
      user: {
        walletPubkey: session.walletPubkey,
        secretKey: session.secretKey, // 🔥 ESSENCIAL
        name: session.name || null
      }
    });

  } catch (err) {
    console.error("SESSION ERROR:", err);
    return res.status(500).json({ ok: false, error: "SESSION_FAILED" });
  }
});
