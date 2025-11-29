// server/sessions.js
const sessions = new Map();

function createSession(walletPubkey, secretKey, res, isProd = false) {
  const sid = Math.random().toString(36).slice(2);

  sessions.set(sid, { walletPubkey, secretKey });

  res.cookie("sid", sid, {
    httpOnly: true,
    sameSite: isProd ? "none" : "lax",
    secure: isProd,
  });

  return sid;
}

function getSession(req) {
  const sid = req.cookies?.sid;
  if (!sid) return null;
  return sessions.get(sid) || null;
}

module.exports = { createSession, getSession };
