
const express = require('express');

const router = express.Router();

const { getDb } = require('../config/database');
const { asyncHandler } = require('../middleware/errorHandler');

// GET /api/services
// List all active services.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const db = getDb();

    const services = db.prepare(`
      SELECT *
      FROM services
      WHERE is_active = 1
      ORDER BY name
    `).all();

    return res.json(services);
  })
);

// GET /api/services/:id
// Retrieve a single service by ID.
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const rawId = req.params.id;

    const id = /^[1-9]\d*$/.test(rawId)
      ? Number(rawId)
      : NaN;

    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({
        error: 'Invalid service ID',
      });
    }

    const db = getDb();

    const service = db.prepare(`
      SELECT *
      FROM services
      WHERE id = ?
    `).get(id);

    if (!service) {
      return res.status(404).json({
        error: 'Service not found',
      });
    }

    return res.json(service);
  })
);

module.exports = router;
