
const express = require('express');
const bcrypt = require('bcryptjs');

const { getDb, runTransaction } = require('../config/database');
const { asyncHandler } = require('../middleware/errorHandler');
const {
  authenticateToken,
  requireRole,
} = require('../middleware/auth');

const router = express.Router();

// Every endpoint in this router is admin-only.
router.use(authenticateToken, requireRole('admin'));

function validId(value) {
  if (
    typeof value !== 'number' &&
    (typeof value !== 'string' || !/^[1-9]\d*$/.test(value))
  ) {
    return null;
  }

  const id = Number(value);

  return Number.isSafeInteger(id) && id > 0
    ? id
    : null;
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isUniqueError(error) {
  return /unique constraint failed/i.test(error.message || '');
}

// -----------------------------------------------------------------------------
// ADMIN OVERVIEW
// GET /api/admin/overview
// -----------------------------------------------------------------------------

router.get(
  '/overview',
  asyncHandler(async (req, res) => {
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);

    const users = db.prepare(`
      SELECT
        COUNT(CASE WHEN role = 'customer' THEN 1 END) AS total_customers,
        COUNT(CASE WHEN role = 'customer' AND is_active = 1 THEN 1 END)
          AS active_customers,
        COUNT(CASE WHEN role = 'staff' THEN 1 END) AS total_staff,
        COUNT(CASE WHEN role = 'staff' AND is_active = 1 THEN 1 END)
          AS active_staff,
        COUNT(CASE WHEN role = 'admin' THEN 1 END) AS total_admins
      FROM users
    `).get();

    const resources = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM services) AS total_services,
        (SELECT COUNT(*) FROM services WHERE is_active = 1)
          AS active_services,
        (SELECT COUNT(*) FROM counters) AS total_counters,
        (SELECT COUNT(*) FROM counters WHERE is_active = 1)
          AS active_counters,
        (SELECT COUNT(*) FROM announcements WHERE is_active = 1)
          AS active_announcements
    `).get();

    const queue = db.prepare(`
      SELECT
        COUNT(*) AS total_tokens,
        COUNT(CASE WHEN status = 'waiting' THEN 1 END)
          AS waiting_tokens,
        COUNT(CASE WHEN status IN ('called', 'serving') THEN 1 END)
          AS active_tokens,
        COUNT(CASE WHEN status = 'completed' THEN 1 END)
          AS completed_tokens,
        COUNT(CASE WHEN status = 'skipped' THEN 1 END)
          AS skipped_tokens,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END)
          AS cancelled_tokens
      FROM tokens
      WHERE date_key = ?
    `).get(today);

    res.json({
      date: today,
      users,
      resources,
      queue,
    });
  })
);

// -----------------------------------------------------------------------------
// STAFF MANAGEMENT
// GET /api/admin/staff
// POST /api/admin/staff
// PATCH /api/admin/staff/:id/status
// -----------------------------------------------------------------------------

router.get(
  '/staff',
  asyncHandler(async (req, res) => {
    const staff = getDb().prepare(`
      SELECT
        id,
        full_name,
        email,
        role,
        is_active,
        created_at,
        updated_at
      FROM users
      WHERE role = 'staff'
      ORDER BY created_at DESC, id DESC
    `).all();

    res.json(staff);
  })
);

router.post(
  '/staff',
  asyncHandler(async (req, res) => {
    const { full_name, email, password } = req.body || {};

    const name = normalizeText(full_name);
    const normalizedEmail = normalizeText(email).toLowerCase();

    if (name.length < 2 || name.length > 100) {
      return res.status(400).json({
        error: 'Staff name must be between 2 and 100 characters.',
      });
    }

    if (
      normalizedEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    ) {
      return res.status(400).json({
        error: 'Enter a valid email address.',
      });
    }

    if (typeof password !== 'string') {
      return res.status(400).json({
        error: 'Password is required.',
      });
    }

    const passwordBytes = Buffer.byteLength(password, 'utf8');

    if (passwordBytes < 8 || passwordBytes > 72) {
      return res.status(400).json({
        error: 'Password must be between 8 and 72 bytes.',
      });
    }

    const db = getDb();

    const existingUser = db.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).get(normalizedEmail);

    if (existingUser) {
      return res.status(409).json({
        error: 'An account with this email already exists.',
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    try {
      const result = db.prepare(`
        INSERT INTO users (full_name, email, password_hash, role)
        VALUES (?, ?, ?, 'staff')
      `).run(name, normalizedEmail, passwordHash);

      const staff = db.prepare(`
        SELECT id, full_name, email, role, is_active, created_at
        FROM users
        WHERE id = ?
      `).get(Number(result.lastInsertRowid));

      res.status(201).json({
        message: 'Staff account created successfully.',
        staff,
      });
    } catch (error) {
      if (isUniqueError(error)) {
        return res.status(409).json({
          error: 'An account with this email already exists.',
        });
      }

      throw error;
    }
  })
);

router.patch(
  '/staff/:id/status',
  asyncHandler(async (req, res) => {
    const id = validId(req.params.id);
    const { is_active } = req.body || {};

    if (!id) {
      return res.status(400).json({ error: 'Invalid staff ID.' });
    }

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({
        error: 'is_active must be true or false.',
      });
    }

    const db = getDb();

    const staff = db.prepare(`
      SELECT id, full_name, email, role, is_active
      FROM users
      WHERE id = ? AND role = 'staff'
    `).get(id);

    if (!staff) {
      return res.status(404).json({
        error: 'Staff account not found.',
      });
    }

    db.prepare(`
      UPDATE users
      SET is_active = ?, updated_at = datetime('now')
      WHERE id = ? AND role = 'staff'
    `).run(is_active ? 1 : 0, id);

    res.json({
      message: is_active
        ? 'Staff account activated successfully.'
        : 'Staff account deactivated successfully.',
      staff: {
        ...staff,
        is_active: is_active ? 1 : 0,
      },
    });
  })
);

// -----------------------------------------------------------------------------
// SERVICE MANAGEMENT
// GET /api/admin/services
// POST /api/admin/services
// PUT /api/admin/services/:id
// PATCH /api/admin/services/:id/status
// -----------------------------------------------------------------------------

router.get(
  '/services',
  asyncHandler(async (req, res) => {
    const services = getDb().prepare(`
      SELECT
        s.*,
        COUNT(c.id) AS total_counters,
        COUNT(CASE WHEN c.is_active = 1 THEN 1 END) AS active_counters
      FROM services s
      LEFT JOIN counters c ON c.service_id = s.id
      GROUP BY s.id
      ORDER BY s.name
    `).all();

    res.json(services);
  })
);

function validateService(body) {
  const name = normalizeText(body?.name);
  const code = normalizeText(body?.code).toUpperCase();
  const description = normalizeText(body?.description);
  const avgTime = Number(body?.avg_time_min);

  if (name.length < 2 || name.length > 100) {
    return { error: 'Service name must be between 2 and 100 characters.' };
  }

  if (!/^[A-Z0-9_-]{2,20}$/.test(code)) {
    return {
      error: 'Service code must be 2–20 characters using letters, numbers, _ or -.',
    };
  }

  if (description.length > 500) {
    return { error: 'Description cannot exceed 500 characters.' };
  }

  if (!Number.isInteger(avgTime) || avgTime < 1 || avgTime > 240) {
    return { error: 'Average time must be between 1 and 240 minutes.' };
  }

  return {
    value: {
      name,
      code,
      description,
      avg_time_min: avgTime,
    },
  };
}

router.post(
  '/services',
  asyncHandler(async (req, res) => {
    const validation = validateService(req.body || {});

    if (validation.error) {
      return res.status(400).json({ error: validation.error });
    }

    const db = getDb();
    const service = validation.value;

    try {
      const result = db.prepare(`
        INSERT INTO services (name, code, description, avg_time_min)
        VALUES (?, ?, ?, ?)
      `).run(
        service.name,
        service.code,
        service.description,
        service.avg_time_min
      );

      const created = db.prepare(
        'SELECT * FROM services WHERE id = ?'
      ).get(Number(result.lastInsertRowid));

      res.status(201).json({
        message: 'Service created successfully.',
        service: created,
      });
    } catch (error) {
      if (isUniqueError(error)) {
        return res.status(409).json({
          error: 'A service with this name or code already exists.',
        });
      }

      throw error;
    }
  })
);

router.put(
  '/services/:id',
  asyncHandler(async (req, res) => {
    const id = validId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'Invalid service ID.' });
    }

    const validation = validateService(req.body || {});

    if (validation.error) {
      return res.status(400).json({ error: validation.error });
    }

    const db = getDb();
    const existing = db.prepare(
      'SELECT id FROM services WHERE id = ?'
    ).get(id);

    if (!existing) {
      return res.status(404).json({ error: 'Service not found.' });
    }

    const service = validation.value;

    try {
      db.prepare(`
        UPDATE services
        SET name = ?, code = ?, description = ?, avg_time_min = ?
        WHERE id = ?
      `).run(
        service.name,
        service.code,
        service.description,
        service.avg_time_min,
        id
      );

      const updated = db.prepare(
        'SELECT * FROM services WHERE id = ?'
      ).get(id);

      res.json({
        message: 'Service updated successfully.',
        service: updated,
      });
    } catch (error) {
      if (isUniqueError(error)) {
        return res.status(409).json({
          error: 'A service with this name or code already exists.',
        });
      }

      throw error;
    }
  })
);

router.patch(
  '/services/:id/status',
  asyncHandler(async (req, res) => {
    const id = validId(req.params.id);
    const { is_active } = req.body || {};

    if (!id) {
      return res.status(400).json({ error: 'Invalid service ID.' });
    }

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({
        error: 'is_active must be true or false.',
      });
    }

    const db = getDb();

    const service = db.prepare(
      'SELECT id, name FROM services WHERE id = ?'
    ).get(id);

    if (!service) {
      return res.status(404).json({ error: 'Service not found.' });
    }

    if (!is_active) {
      const activeTokens = db.prepare(`
        SELECT COUNT(*) AS count
        FROM tokens
        WHERE service_id = ?
          AND status IN ('waiting', 'called', 'serving')
      `).get(id).count;

      if (activeTokens > 0) {
        return res.status(409).json({
          error: 'This service has active queue tokens. Complete or skip them before deactivating the service.',
        });
      }

      runTransaction((transactionDb) => {
        transactionDb.prepare(`
          UPDATE services SET is_active = 0 WHERE id = ?
        `).run(id);

        transactionDb.prepare(`
          UPDATE counters SET is_active = 0 WHERE service_id = ?
        `).run(id);
      });
    } else {
      db.prepare(`
        UPDATE services SET is_active = 1 WHERE id = ?
      `).run(id);
    }

    const updated = db.prepare(
      'SELECT * FROM services WHERE id = ?'
    ).get(id);

    res.json({
      message: is_active
        ? 'Service activated successfully. Its counters remain in their current status.'
        : 'Service and its counters deactivated successfully.',
      service: updated,
    });
  })
);

// -----------------------------------------------------------------------------
// COUNTER MANAGEMENT
// GET /api/admin/counters
// POST /api/admin/counters
// PUT /api/admin/counters/:id
// PATCH /api/admin/counters/:id/status
// -----------------------------------------------------------------------------

router.get(
  '/counters',
  asyncHandler(async (req, res) => {
    const counters = getDb().prepare(`
      SELECT
        c.*,
        s.name AS service_name,
        s.code AS service_code,
        s.is_active AS service_is_active
      FROM counters c
      JOIN services s ON s.id = c.service_id
      ORDER BY s.name, c.name
    `).all();

    res.json(counters);
  })
);

function validateCounter(body) {
  const name = normalizeText(body?.name);
  const serviceId = validId(body?.service_id);

  if (name.length < 2 || name.length > 100) {
    return { error: 'Counter name must be between 2 and 100 characters.' };
  }

  if (!serviceId) {
    return { error: 'A valid service must be selected.' };
  }

  return {
    value: {
      name,
      service_id: serviceId,
    },
  };
}

router.post(
  '/counters',
  asyncHandler(async (req, res) => {
    const validation = validateCounter(req.body || {});

    if (validation.error) {
      return res.status(400).json({ error: validation.error });
    }

    const db = getDb();
    const counter = validation.value;

    const service = db.prepare(`
      SELECT id FROM services WHERE id = ? AND is_active = 1
    `).get(counter.service_id);

    if (!service) {
      return res.status(400).json({
        error: 'Select an active service for this counter.',
      });
    }

    try {
      const result = db.prepare(`
        INSERT INTO counters (name, service_id)
        VALUES (?, ?)
      `).run(counter.name, counter.service_id);

      const created = db.prepare(`
        SELECT c.*, s.name AS service_name, s.code AS service_code
        FROM counters c
        JOIN services s ON s.id = c.service_id
        WHERE c.id = ?
      `).get(Number(result.lastInsertRowid));

      res.status(201).json({
        message: 'Counter created successfully.',
        counter: created,
      });
    } catch (error) {
      if (isUniqueError(error)) {
        return res.status(409).json({
          error: 'A counter with this name already exists.',
        });
      }

      throw error;
    }
  })
);

router.put(
  '/counters/:id',
  asyncHandler(async (req, res) => {
    const id = validId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'Invalid counter ID.' });
    }

    const validation = validateCounter(req.body || {});

    if (validation.error) {
      return res.status(400).json({ error: validation.error });
    }

    const db = getDb();
    const existing = db.prepare(
      'SELECT id, service_id FROM counters WHERE id = ?'
    ).get(id);

    if (!existing) {
      return res.status(404).json({ error: 'Counter not found.' });
    }

    const counter = validation.value;

    const service = db.prepare(`
      SELECT id FROM services WHERE id = ? AND is_active = 1
    `).get(counter.service_id);

    if (!service) {
      return res.status(400).json({
        error: 'Select an active service for this counter.',
      });
    }

    const activeToken = db.prepare(`
      SELECT id
      FROM tokens
      WHERE counter_id = ?
        AND status IN ('called', 'serving')
      LIMIT 1
    `).get(id);

    if (activeToken && existing.service_id !== counter.service_id) {
      return res.status(409).json({
        error: 'This counter has an active token and cannot be reassigned yet.',
      });
    }

    try {
      db.prepare(`
        UPDATE counters
        SET name = ?, service_id = ?
        WHERE id = ?
      `).run(counter.name, counter.service_id, id);

      const updated = db.prepare(`
        SELECT c.*, s.name AS service_name, s.code AS service_code
        FROM counters c
        JOIN services s ON s.id = c.service_id
        WHERE c.id = ?
      `).get(id);

      res.json({
        message: 'Counter updated successfully.',
        counter: updated,
      });
    } catch (error) {
      if (isUniqueError(error)) {
        return res.status(409).json({
          error: 'A counter with this name already exists.',
        });
      }

      throw error;
    }
  })
);

router.patch(
  '/counters/:id/status',
  asyncHandler(async (req, res) => {
    const id = validId(req.params.id);
    const { is_active } = req.body || {};

    if (!id) {
      return res.status(400).json({ error: 'Invalid counter ID.' });
    }

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({
        error: 'is_active must be true or false.',
      });
    }

    const db = getDb();

    const counter = db.prepare(
      'SELECT id FROM counters WHERE id = ?'
    ).get(id);

    if (!counter) {
      return res.status(404).json({ error: 'Counter not found.' });
    }

    if (!is_active) {
      const activeToken = db.prepare(`
        SELECT id
        FROM tokens
        WHERE counter_id = ?
          AND status IN ('called', 'serving')
        LIMIT 1
      `).get(id);

      if (activeToken) {
        return res.status(409).json({
          error: 'This counter is serving an active token. Complete or skip it before deactivating the counter.',
        });
      }
    }

    db.prepare(`
      UPDATE counters SET is_active = ? WHERE id = ?
    `).run(is_active ? 1 : 0, id);

    res.json({
      message: is_active
        ? 'Counter activated successfully.'
        : 'Counter deactivated successfully.',
    });
  })
);

// -----------------------------------------------------------------------------
// ANNOUNCEMENT MANAGEMENT
// GET /api/admin/announcements
// -----------------------------------------------------------------------------

router.get(
  '/announcements',
  asyncHandler(async (req, res) => {
    const announcements = getDb().prepare(`
      SELECT *
      FROM announcements
      ORDER BY is_active DESC, priority DESC, created_at DESC
    `).all();

    res.json(announcements);
  })
);

module.exports = router;
