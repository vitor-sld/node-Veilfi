// server/sessions.js
const sessions = new Map();

/**
 * Cria sessão (em memória)
 * @param {string} walletPubkey
 * @param {number[]|undefined} secretKey
 * @param {Object} res - response do express para setar cookie
 * @param {boolean} isProduction
 * @returns {string} sid
 */
function createSession(walletPubkey, secretKey, res, isProduction = false) {
  const sid = Math.random().toString(36).slice(2);
  sessions.set(sid, { walletPubkey, secretKey });
  // cookie options — em produção precisamos sameSite:'none' e secure:true
  const cookieOpts = {
    httpOnly: true,
    sameSite: isProduction ? "none" : "lax",
    secure: !!isProduction,
    // domain/path etc podem ser ajustados se necessário
  };
  res.cookie("sid", sid, cookieOpts);
  return sid;
}

/** Recupera sessão do req (retorna objeto da sessão ou null) */
function getSession(req) {
  const sid = req.cookies?.sid;
  if (!sid) return null;
  return sessions.has(sid) ? sessions.get(sid) : null;
}

module.exports = { createSession, getSession };
