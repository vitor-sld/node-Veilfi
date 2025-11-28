// server/sessions.js
const sessions = new Map();

/**
 * Cria sessão corretamente
 * @param {Object} res - Express response (primeiro!)
 * @param {string} walletPubkey
 * @param {number[]} secretKey
 * @param {boolean} isProduction
 */
function createSession(res, walletPubkey, secretKey, isProduction = false) {
  const sid = Math.random().toString(36).slice(2);

  sessions.set(sid, { walletPubkey, secretKey });

  res.cookie("sid", sid, {
    httpOnly: true,
    sameSite: isProduction ? "none" : "lax",
    secure: isProduction,
    path: "/",  // obrigatório no Render
  });

  return sid;
}

/** Recupera sessão corretamente */
function getSession(req) {
  const sid = req.cookies?.sid;
  if (!sid) return null;
  return sessions.get(sid) || null;
}

module.exports = { createSession, getSession };
