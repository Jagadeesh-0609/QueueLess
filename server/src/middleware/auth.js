
const jwt = require('jsonwebtoken');
const { getDb } = require('../config/database');

const VALID_ROLES = ['customer', 'staff', 'admin'];

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (
    typeof authHeader !== 'string' ||
    !authHeader.startsWith('Bearer ')
  ) {
    return res.status(401).json({
      error: 'Access token is required.',
    });
  }

  const token = authHeader.slice(7).trim();

  if (!token || token.includes(' ')) {
    return res.status(401).json({
      error: 'Invalid authorization header.',
    });
  }

  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    return res.status(500).json({
      error: 'Authentication service is not configured correctly.',
    });
  }

  let payload;

  try {
    payload = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer: 'queueless',
    });
  } catch (error) {
    return res.status(401).json({
      error: 'Invalid or expired access token.',
    });
  }

  const userId = Number(payload.sub);

  if (
    !Number.isSafeInteger(userId) ||
    userId <= 0
  ) {
    return res.status(401).json({
      error: 'Invalid access token.',
    });
  }

  try {
    const user = getDb()
      .prepare(`
        SELECT id, full_name, email, role, is_active
        FROM users
        WHERE id = ?
      `)
      .get(userId);

    if (!user || user.is_active !== 1) {
      return res.status(401).json({
        error: 'User account is unavailable.',
      });
    }

    if (!VALID_ROLES.includes(user.role)) {
      return res.status(403).json({
        error: 'Invalid user role.',
      });
    }

    req.user = {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      role: user.role,
    };

    return next();
  } catch (error) {
    return next(error);
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication is required.',
      });
    }

    if (
      !allowedRoles.length ||
      !allowedRoles.every((role) => VALID_ROLES.includes(role))
    ) {
      return res.status(500).json({
        error: 'Invalid role configuration.',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'You do not have permission to access this resource.',
      });
    }

    return next();
  };
}

module.exports = {
  authenticateToken,
  requireRole,
};
