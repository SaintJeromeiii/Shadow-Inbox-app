const { resolveAccountKey } = require('./accounts');

function getOperatorAccountKeys() {
  return new Set(
    String(process.env.ADMIN_ACCOUNT_KEYS || process.env.AI_LIMIT_EXEMPT_ACCOUNT_KEYS || 'personal')
      .split(',')
      .map((key) => key.trim())
      .filter(Boolean),
  );
}

function isOperatorAccountKey(accountKey) {
  const raw = String(accountKey || 'personal').trim().toLowerCase();
  const resolved = resolveAccountKey(accountKey || 'personal');
  const operatorKeys = getOperatorAccountKeys();
  return operatorKeys.has(raw) || operatorKeys.has(resolved);
}

function getAccountKeyFromAdminRequest(req) {
  const header = req.headers['x-account-key'];
  const query = req.query?.accountKey;
  const bodyKey = req.body?.accountKey;
  return resolveAccountKey(header || query || bodyKey || 'personal');
}

function requireAdminAuth(req, res, next) {
  const adminSecret = process.env.ADMIN_SECRET;
  const clientToken = req.headers['x-admin-token'];
  const accountKey = getAccountKeyFromAdminRequest(req);

  if (isOperatorAccountKey(accountKey)) {
    return next();
  }

  if (!adminSecret) {
    console.error('[Security] ADMIN_SECRET is missing — admin API disabled.');
    return res.status(500).json({ error: 'Security configuration error.' });
  }

  if (clientToken && clientToken === adminSecret) {
    return next();
  }

  console.warn(
    `[Security] Blocked admin access for account "${accountKey}" from ${req.ip || 'unknown'}`,
  );
  return res.status(401).json({ error: 'Unauthorized access.' });
}

module.exports = {
  getOperatorAccountKeys,
  isOperatorAccountKey,
  getAccountKeyFromAdminRequest,
  requireAdminAuth,
};
