
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const { getDb } = require('../config/database');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const SALT_ROUNDS = 12;
const MIN_PASSWORD_BYTES = 8;
const MAX_PASSWORD_BYTES = 72;

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'Too many authentication attempts. Please try again later.',
  },
});

function isValidRequestBody(body) {
  return (
    body !== null &&
    typeof body === 'object' &&
    !Array.isArray(body)
  );
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function isValidEmail(email) {
  return (
    typeof email === 'string' &&
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  );
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (
    typeof secret !== 'string' ||
    Buffer.byteLength(secret, 'utf8') < 32
  ) {
    const error = new Error(
      'JWT_SECRET must be configured with a strong random secret.'
    );

    error.status = 500;
    throw error;
  }

  return secret;
}

function createAccessToken(user, secret = getJwtSecret()) {
  return jwt.sign(
    { role: user.role },
    secret,
    {
      algorithm: 'HS256',
      subject: String(user.id),
      expiresIn: '2h',
      issuer: 'queueless',
    }
  );
}

function publicUser(user) {
  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    role: user.role,
  };
}

// POST /api/auth/register
// Public registration always creates a customer account.
router.post(
  '/register',
  authLimiter,
  asyncHandler(async (req, res) => {
    if (!isValidRequestBody(req.body)) {
      return res.status(400).json({
        error: 'A valid request body is required.',
      });
    }

    const { full_name, email, password } = req.body;

    if (
      typeof full_name !== 'string' ||
      typeof email !== 'string' ||
      typeof password !== 'string'
    ) {
      return res.status(400).json({
        error: 'Full name, email, and password are required.',
      });
    }

    const name = full_name.trim();
    const normalizedEmail = normalizeEmail(email);

    if (name.length < 2 || name.length > 100) {
      return res.status(400).json({
        error: 'Full name must be between 2 and 100 characters.',
      });
    }

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({
        error: 'Enter a valid email address.',
      });
    }

    const passwordBytes = Buffer.byteLength(password, 'utf8');

    if (
      passwordBytes < MIN_PASSWORD_BYTES ||
      passwordBytes > MAX_PASSWORD_BYTES
    ) {
      return res.status(400).json({
        error: 'Password must be between 8 and 72 bytes.',
      });
    }

    // Validate JWT configuration before creating a database account.
    const secret = getJwtSecret();

    const db = getDb();

    const existingUser = db.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).get(normalizedEmail);

    if (existingUser) {
      return res.status(409).json({
        error: 'An account with this email already exists.',
      });
    }

    const passwordHash = await bcrypt.hash(
      password,
      SALT_ROUNDS
    );

    let result;

    try {
      result = db.prepare(`
        INSERT INTO users (
          full_name,
          email,
          password_hash,
          role
        )
        VALUES (?, ?, ?, 'customer')
      `).run(
        name,
        normalizedEmail,
        passwordHash
      );
    } catch (error) {
      if (
        error.code === 'ERR_SQLITE_ERROR' &&
        /unique/i.test(error.message || '')
      ) {
        return res.status(409).json({
          error: 'An account with this email already exists.',
        });
      }

      throw error;
    }

    const user = db.prepare(`
      SELECT id, full_name, email, role, is_active
      FROM users
      WHERE id = ?
    `).get(Number(result.lastInsertRowid));

    if (!user) {
      throw new Error('Unable to retrieve the created account.');
    }

    const accessToken = createAccessToken(user, secret);

    return res.status(201).json({
      message: 'Account created successfully.',
      user: publicUser(user),
      token: accessToken,
    });
  })
);

// POST /api/auth/login
router.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    if (!isValidRequestBody(req.body)) {
      return res.status(400).json({
        error: 'A valid request body is required.',
      });
    }

    const { email, password } = req.body;

    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        error: 'Email and password are required.',
      });
    }

    const normalizedEmail = normalizeEmail(email);

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({
        error: 'Enter a valid email address.',
      });
    }

    if (
      Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES
    ) {
      return res.status(400).json({
        error: 'Password must not exceed 72 bytes.',
      });
    }

    const secret = getJwtSecret();

    const user = getDb().prepare(`
      SELECT
        id,
        full_name,
        email,
        password_hash,
        role,
        is_active
      FROM users
      WHERE email = ?
    `).get(normalizedEmail);

    // Use the same response for unknown emails and incorrect passwords.
    if (
      !user ||
      !(await bcrypt.compare(password, user.password_hash))
    ) {
      return res.status(401).json({
        error: 'Invalid email or password.',
      });
    }

    if (user.is_active !== 1) {
      return res.status(403).json({
        error: 'This account has been deactivated.',
      });
    }

    const accessToken = createAccessToken(user, secret);

    return res.json({
      message: 'Login successful.',
      user: publicUser(user),
      token: accessToken,
    });
  })
);

// GET /api/auth/me
router.get(
  '/me',
  authenticateToken,
  (req, res) => {
    return res.json({
      user: req.user,
    });
  }
);

module.exports = router;
