
const express = require('express');
const router = express.Router();

const AnalyticsService = require('../services/analyticsService');
const { asyncHandler } = require('../middleware/errorHandler');
const {
  authenticateToken,
  requireRole,
} = require('../middleware/auth');

function validateDateQuery(req, res, next) {
  const { date } = req.query;

  if (date === undefined) {
    return next();
  }

  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({
      error: 'date must be in YYYY-MM-DD format',
    });
  }

  const [year, month, day] = date.split('-').map(Number);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));

  if (
    parsedDate.getUTCFullYear() !== year ||
    parsedDate.getUTCMonth() !== month - 1 ||
    parsedDate.getUTCDate() !== day
  ) {
    return res.status(400).json({
      error: 'date must be a valid calendar date',
    });
  }

  next();
}

// GET /api/analytics
// Only staff and admins can view analytics.
router.get(
  '/',
  authenticateToken,
  requireRole('staff', 'admin'),
  validateDateQuery,
  asyncHandler(async (req, res) => {
    const { date } = req.query;
    const data = AnalyticsService.getDashboard(date);

    res.json(data);
  }),
);

module.exports = router;
