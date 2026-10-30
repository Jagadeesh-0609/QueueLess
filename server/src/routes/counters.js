
const express = require('express');
const router = express.Router();

const { getDb } = require('../config/database');
const { asyncHandler } = require('../middleware/errorHandler');
const {
  authenticateToken,
  requireRole,
} = require('../middleware/auth');

// Validate optional service_id query parameter.
function validateServiceId(req, res, next) {
  const { service_id } = req.query;

  if (service_id === undefined) {
    return next();
  }

  if (
    !/^\d+$/.test(String(service_id)) ||
    !Number.isSafeInteger(Number(service_id)) ||
    Number(service_id) <= 0
  ) {
    return res.status(400).json({
      error: 'service_id must be a positive integer',
    });
  }

  next();
}

// GET /api/counters
// Staff and Admin only.
router.get(
  '/',
  authenticateToken,
  requireRole('staff', 'admin'),
  validateServiceId,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const { service_id } = req.query;

    let query = `
      SELECT
        c.*,
        s.name AS service_name,
        s.code AS service_code
      FROM counters c
      JOIN services s ON c.service_id = s.id
      WHERE c.is_active = 1
    `;

    const params = [];

    if (service_id !== undefined) {
      query += ' AND c.service_id = ?';
      params.push(Number(service_id));
    }

    query += ' ORDER BY c.name';

    const counters = db.prepare(query).all(...params);

    const getActiveToken = db.prepare(`
      SELECT
        t.id,
        t.token_number,
        t.status,
        t.customer_name,
        t.priority,
        s.name AS service_name
      FROM tokens t
      JOIN services s ON t.service_id = s.id
      WHERE t.counter_id = ?
        AND t.status IN ('called', 'serving')
      LIMIT 1
    `);

    res.json(
      counters.map((counter) => ({
        ...counter,
        active_token: getActiveToken.get(counter.id) || null,
      }))
    );
  })
);

// GET /api/counters/:id
// Staff and Admin only.
router.get(
  '/:id',
  authenticateToken,
  requireRole('staff', 'admin'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);

    if (
      !/^\d+$/.test(req.params.id) ||
      !Number.isSafeInteger(id) ||
      id <= 0
    ) {
      return res.status(400).json({
        error: 'Invalid counter ID',
      });
    }

    const db = getDb();

    const counter = db.prepare(`
      SELECT
        c.*,
        s.name AS service_name,
        s.code AS service_code
      FROM counters c
      JOIN services s ON c.service_id = s.id
      WHERE c.id = ?
    `).get(id);

    if (!counter) {
      return res.status(404).json({
        error: 'Counter not found',
      });
    }

    const activeToken = db.prepare(`
      SELECT
        t.*,
        s.name AS service_name,
        s.code AS service_code
      FROM tokens t
      JOIN services s ON t.service_id = s.id
      WHERE t.counter_id = ?
        AND t.status IN ('called', 'serving')
      LIMIT 1
    `).get(id);

    res.json({
      ...counter,
      active_token: activeToken || null,
    });
  })
);

module.exports = router;
