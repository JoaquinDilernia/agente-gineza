export function createAuthMiddleware({ auth, allowedEmail }) {
  return async (req, res, next) => {
    const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'falta token' });
    try {
      const decoded = await auth.verifyIdToken(token);
      if (allowedEmail && decoded.email !== allowedEmail) return res.status(403).json({ error: 'no autorizado' });
      req.user = decoded;
      next();
    } catch {
      res.status(401).json({ error: 'token inválido' });
    }
  };
}
