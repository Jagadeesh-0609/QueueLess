
const express = require('express');

const { getDb } = require('../config/database');
const { asyncHandler } = require('../middleware/errorHandler');
const {
  authenticateToken,
  requireRole,
} = require('../middleware/auth');

const router = express.Router();

// Public endpoint: active announcements can be displayed on queue screens.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const announcements = getDb().prepare(`
      SELECT *
      FROM announcements
      WHERE is_active = 1
      ORDER BY priority DESC, created_at DESC
    `).all();

    res.json(announcements);
  })
);

// Only admins can create announcements.
router.post(
  '/',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const db = getDb();
    const { message, priority } = req.body || {};

    if (
      typeof message !== 'string' ||
      !message.trim() ||
      message.trim().length > 500
    ) {
      return res.status(400).json({
        error: 'Announcement message is required and cannot exceed 500 characters.',
      });
    }

    const parsedPriority =
      priority === undefined
        ? 0
        : typeof priority === 'number'
          ? priority
          : typeof priority === 'string' && /^[0-9]+$/.test(priority)
            ? Number(priority)
            : NaN;

    if (
      !Number.isSafeInteger(parsedPriority) ||
      parsedPriority < 0 ||
      parsedPriority > 10
    ) {
      return res.status(400).json({
        error: 'Priority must be an integer between 0 and 10.',
      });
    }

    const result = db.prepare(`
      INSERT INTO announcements (message, priority)
      VALUES (?, ?)
    `).run(message.trim(), parsedPriority);

    const announcement = db.prepare(`
      SELECT *
      FROM announcements
      WHERE id = ?
    `).get(Number(result.lastInsertRowid));

    res.status(201).json({
      message: 'Announcement created successfully.',
      announcement,
    });
  })
);

// Only admins can deactivate announcements.
router.delete(
  '/:id',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const rawId = req.params.id;

    const id = /^[1-9]\d*$/.test(rawId)
      ? Number(rawId)
      : NaN;

    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({
        error: 'Invalid announcement ID.',
      });
    }

    const result = getDb().prepare(`
      UPDATE announcements
      SET is_active = 0
      WHERE id = ? AND is_active = 1
    `).run(id);

    if (result.changes === 0) {
      return res.status(404).json({
        error: 'Active announcement not found.',
      });
    }

    res.json({
      message: 'Announcement deactivated successfully.',
    });
  })
);

module.exports = router;
