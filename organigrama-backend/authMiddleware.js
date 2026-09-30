const crypto = require('node:crypto');

const MOCK_ROLES = new Set(['admin', 'user']);
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function isLoopbackRequest(req) {
  return LOOPBACK_ADDRESSES.has(req.socket?.remoteAddress);
}

function matchesDevelopmentToken(token) {
  const expectedToken = process.env.DEV_BEARER_TOKEN;
  if (!expectedToken || !token) return false;

  const provided = Buffer.from(token);
  const expected = Buffer.from(expectedToken);
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

function authenticateToken(req, res, next) {
  const isMockMode = process.env.AUTH_MODE === 'mock';
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isMockMode || isProduction) {
    return res.status(503).json({ error: 'Autenticación no configurada para este entorno' });
  }

  if (!isLoopbackRequest(req)) {
    return res.status(403).json({ error: 'La autenticación mock solo está disponible localmente' });
  }

  const authorization = req.get('authorization') || '';
  const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);

  if (bearerMatch && matchesDevelopmentToken(bearerMatch[1])) {
    req.user = {
      id: 'local-dev-admin',
      role: process.env.DEV_BEARER_ROLE || 'admin',
      authMode: 'mock',
    };
    return next();
  }

  const simulatedRole = req.get('x-user-role');
  if (
    process.env.DEV_AUTH_ALLOW_HEADER === 'true' &&
    isLoopbackRequest(req) &&
    MOCK_ROLES.has(simulatedRole)
  ) {
    req.user = { id: 'local-dev-user', role: simulatedRole, authMode: 'mock' };
    return next();
  }

  return res.status(401).json({ error: 'Autenticación requerida' });
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Se requieren permisos de administrador' });
  }

  return next();
}

module.exports = { authenticateToken, requireAdmin };