
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const router = express.Router();

const TokenService = require('../services/tokenService');
const { getDb } = require('../config/database');
const { asyncHandler } = require('../middleware/errorHandler');
const {
  validateTokenCreation,
  validateIdParam,
} = require('../middleware/validation');
const {
  authenticateToken,
  requireRole,
} = require('../middleware/auth');

// --------------------------------------------------
// Validation helpers
// --------------------------------------------------

const VALID_STATUSES = [
  'waiting',
  'called',
  'serving',
  'completed',
  'skipped',
  'cancelled',
];

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function validateDateQuery(req, res, next) {
  const { date } = req.query;

  if (date !== undefined && !isValidDate(date)) {
    return res.status(400).json({
      error: 'date must be a valid date in YYYY-MM-DD format',
    });
  }

  next();
}

function validateTokenListQuery(req, res, next) {
  const { service_id, status, limit } = req.query;

  if (
    service_id !== undefined &&
    (!/^\d+$/.test(String(service_id)) ||
      !Number.isSafeInteger(Number(service_id)) ||
      Number(service_id) <= 0)
  ) {
    return res.status(400).json({
      error: 'service_id must be a positive integer',
    });
  }

  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({
      error: 'Invalid token status',
    });
  }

  if (
    limit !== undefined &&
    (!/^\d+$/.test(String(limit)) ||
      !Number.isInteger(Number(limit)) ||
      Number(limit) < 1 ||
      Number(limit) > 500)
  ) {
    return res.status(400).json({
      error: 'Limit must be an integer between 1 and 500',
    });
  }

  next();
}

function validateOptionalServiceId(req, res, next) {
  const { service_id } = req.query;

  if (
    service_id !== undefined &&
    (!/^\d+$/.test(String(service_id)) ||
      !Number.isSafeInteger(Number(service_id)) ||
      Number(service_id) <= 0)
  ) {
    return res.status(400).json({
      error: 'service_id must be a positive integer',
    });
  }

  next();
}

// --------------------------------------------------
// Public lookup rate limiter
// --------------------------------------------------

const publicLookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'Too many token lookup requests. Please try again later.',
  },
});

// --------------------------------------------------
// Token ownership
// --------------------------------------------------

function authorizeTokenAccess(req, token) {
  if (
    req.user.role === 'customer' &&
    Number(token.user_id) !== Number(req.user.id)
  ) {
    const error = new Error(
      'You are not authorized to access this token'
    );

    error.status = 403;
    throw error;
  }
}

// --------------------------------------------------
// POST /api/tokens
// Create a token for the logged-in customer
// --------------------------------------------------

router.post(
  '/',
  authenticateToken,
  requireRole('customer'),
  validateTokenCreation,
  asyncHandler(async (req, res) => {
    const { service_id, priority = 0 } = req.body;
    const db = getDb();

    const customer = db.prepare(`
      SELECT id, full_name
      FROM users
      WHERE id = ? AND is_active = 1
    `).get(req.user.id);

    if (!customer) {
      return res.status(401).json({
        error: 'Customer account is unavailable',
      });
    }

    const token = TokenService.createToken(
      Number(service_id),
      Number(priority),
      customer.full_name,
      Number(customer.id)
    );

    res.status(201).json(token);
  })
);

// --------------------------------------------------
// GET /api/tokens/customer/history
// Customer can access only their own history
// --------------------------------------------------

router.get(
  '/customer/history',
  authenticateToken,
  requireRole('customer'),
  asyncHandler(async (req, res) => {
    const db = getDb();

    const tokens = db.prepare(`
      SELECT
        t.id,
        t.token_number,
        t.daily_number,
        t.service_id,
        t.priority,
        t.status,
        t.date_key,
        t.created_at,
        t.called_at,
        t.serving_at,
        t.completed_at,
        s.name AS service_name,
        s.code AS service_code,
        c.name AS counter_name
      FROM tokens t
      JOIN services s ON t.service_id = s.id
      LEFT JOIN counters c ON t.counter_id = c.id
      WHERE t.user_id = ?
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT 200
    `).all(Number(req.user.id));

    res.json({ tokens });
  })
);

// --------------------------------------------------
// GET /api/tokens
// Staff and Admin token listing
// --------------------------------------------------

router.get(
  '/',
  authenticateToken,
  requireRole('staff', 'admin'),
  validateDateQuery,
  validateTokenListQuery,
  asyncHandler(async (req, res) => {
    const { service_id, status, date, limit } = req.query;

    const parsedLimit = limit === undefined ? 100 : Number(limit);

    const tokens = TokenService.getTokens({
      serviceId: service_id === undefined
        ? undefined
        : Number(service_id),
      status,
      dateKey: date,
      limit: parsedLimit,
    });

    res.json(tokens);
  })
);

// --------------------------------------------------
// GET /api/tokens/queue
// Staff and Admin queue
// --------------------------------------------------

router.get(
  '/queue',
  authenticateToken,
  requireRole('staff', 'admin'),
  validateDateQuery,
  validateOptionalServiceId,
  asyncHandler(async (req, res) => {
    const { service_id, date } = req.query;

    const queue = TokenService.getQueue(
      service_id === undefined ? null : Number(service_id),
      date
    );

    res.json(queue);
  })
);

// --------------------------------------------------
// GET /api/tokens/display
// Staff and Admin all-service display
// --------------------------------------------------

router.get(
  '/display',
  authenticateToken,
  requireRole('staff', 'admin'),
  asyncHandler(async (req, res) => {
    res.json(TokenService.getDisplayData());
  })
);

// --------------------------------------------------
// GET /api/tokens/customer/display/:tokenId
// Customer-specific service display
// --------------------------------------------------

router.get(
  '/customer/display/:tokenId',
  authenticateToken,
  requireRole('customer'),
  validateIdParam('tokenId'),
  asyncHandler(async (req, res) => {
    const data = TokenService.getCustomerDisplayData(
      Number(req.params.tokenId),
      Number(req.user.id)
    );

    res.json(data);
  })
);

// --------------------------------------------------
// GET /api/tokens/lookup/:tokenNumber
// Public token lookup - privacy protected
// --------------------------------------------------

router.get(
  '/lookup/:tokenNumber',
  publicLookupLimiter,
  validateDateQuery,
  asyncHandler(async (req, res) => {
    const { tokenNumber } = req.params;
    const { date } = req.query;

    if (
      typeof tokenNumber !== 'string' ||
      !/^[A-Za-z0-9-]{1,30}$/.test(tokenNumber)
    ) {
      return res.status(400).json({
        error: 'Invalid token number',
      });
    }

    const token = TokenService.getTokenByNumber(
      tokenNumber,
      date
    );

    // Never expose customer identity through public lookup.
    const {
      user_id,
      customer_name,
      ...publicToken
    } = token;

    res.json(publicToken);
  })
);

// --------------------------------------------------
// GET /api/tokens/:id/events
// Token details and event timeline
// --------------------------------------------------

router.get(
  '/:id/events',
  authenticateToken,
  validateIdParam('id'),
  asyncHandler(async (req, res) => {
    const tokenId = Number(req.params.id);
    const token = TokenService.getTokenById(tokenId);

    authorizeTokenAccess(req, token);

    const db = getDb();

    const events = db.prepare(`
      SELECT
        e.id,
        e.token_id,
        e.event_type,
        e.counter_id,
        e.details,
        e.created_at,
        c.name AS counter_name
      FROM token_events e
      LEFT JOIN counters c ON e.counter_id = c.id
      WHERE e.token_id = ?
      ORDER BY e.created_at ASC, e.id ASC
    `).all(tokenId);

    const {
      user_id,
      customer_name,
      ...publicToken
    } = token;

    res.json({
      token: publicToken,
      events,
    });
  })
);

// --------------------------------------------------
// GET /api/tokens/:id
// Get a single token
// --------------------------------------------------

router.get(
  '/:id',
  authenticateToken,
  validateIdParam('id'),
  asyncHandler(async (req, res) => {
    const token = TokenService.getTokenById(req.params.id);

    authorizeTokenAccess(req, token);

    const {
      user_id,
      ...publicToken
    } = token;

    res.json(publicToken);
  })
);

// --------------------------------------------------
// POST /api/tokens/call/:counterId
// Call next token
// --------------------------------------------------

router.post(
  '/call/:counterId',
  authenticateToken,
  requireRole('staff', 'admin'),
  validateIdParam('counterId'),
  asyncHandler(async (req, res) => {
    const token = TokenService.callNext(
      Number(req.params.counterId)
    );

    res.json(token);
  })
);

// --------------------------------------------------
// POST /api/tokens/:id/recall
// Recall current token
// --------------------------------------------------

router.post(
  '/:id/recall',
  authenticateToken,
  requireRole('staff', 'admin'),
  validateIdParam('id'),
  asyncHandler(async (req, res) => {
    const token = TokenService.recallToken(
      Number(req.params.id)
    );

    res.json(token);
  })
);

// --------------------------------------------------
// POST /api/tokens/:id/serve
// Start serving
// --------------------------------------------------

router.post(
  '/:id/serve',
  authenticateToken,
  requireRole('staff', 'admin'),
  validateIdParam('id'),
  asyncHandler(async (req, res) => {
    const token = TokenService.startServing(
      Number(req.params.id)
    );

    res.json(token);
  })
);

// --------------------------------------------------
// POST /api/tokens/:id/complete
// Complete service
// --------------------------------------------------

router.post(
  '/:id/complete',
  authenticateToken,
  requireRole('staff', 'admin'),
  validateIdParam('id'),
  asyncHandler(async (req, res) => {
    const token = TokenService.completeToken(
      Number(req.params.id)
    );

    res.json(token);
  })
);

// --------------------------------------------------
// POST /api/tokens/:id/skip
// Skip token
// --------------------------------------------------

router.post(
  '/:id/skip',
  authenticateToken,
  requireRole('staff', 'admin'),
  validateIdParam('id'),
  asyncHandler(async (req, res) => {
    const token = TokenService.skipToken(
      Number(req.params.id)
    );

    res.json(token);
  })
);

module.exports = router;
