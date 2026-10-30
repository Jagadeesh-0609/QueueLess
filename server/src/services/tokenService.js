
const { getDb, runTransaction } = require('../config/database');

class TokenService {
  /**
   * Create a new token for a service.
   * The token and its creation event are saved atomically.
   */
  static createToken(serviceId, priority = 0, customerName = '', userId = null) {
    return runTransaction((db) => {
      const service = db.prepare(
        'SELECT * FROM services WHERE id = ? AND is_active = 1'
      ).get(serviceId);

      if (!service) {
        throw { status: 404, message: 'Service not found or inactive' };
      }

      if (![0, 1, 2].includes(priority)) {
        throw {
          status: 400,
          message: 'Priority must be 0 (normal), 1 (high), or 2 (urgent)'
        };
      }

      const today = new Date().toISOString().slice(0, 10);

      const lastToken = db.prepare(
        'SELECT MAX(daily_number) AS max_num FROM tokens WHERE service_id = ? AND date_key = ?'
      ).get(serviceId, today);

      const dailyNumber = (lastToken?.max_num || 0) + 1;
      const tokenNumber = `${service.code}-${String(dailyNumber).padStart(3, '0')}`;

      const result = db.prepare(`
        INSERT INTO tokens (
          token_number,
          daily_number,
          service_id,
          priority,
          customer_name,
          date_key,
          user_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        tokenNumber,
        dailyNumber,
        serviceId,
        priority,
        customerName,
        today,
        userId
      );

      const tokenId = Number(result.lastInsertRowid);

      db.prepare(`
        INSERT INTO token_events (token_id, event_type, details)
        VALUES (?, 'created', ?)
      `).run(tokenId, `Token ${tokenNumber} created`);

      return db.prepare(
        'SELECT * FROM tokens WHERE id = ?'
      ).get(tokenId);
    });
  }

  /**
   * Get the waiting queue.
   *
   * Option A fairness:
   * - Urgent tokens always remain first.
   * - Aged non-urgent tokens are promoted above unaged non-urgent tokens.
   * - High priority remains above normal priority when not promoted.
   * - Creation time and ID provide deterministic ordering.
   */
  static getQueue(serviceId, dateKey) {
    const db = getDb();
    const today = dateKey || new Date().toISOString().slice(0, 10);

    const service = serviceId
      ? db.prepare('SELECT avg_time_min FROM services WHERE id = ?').get(serviceId)
      : null;

    const starvationThresholdMinutes = service
      ? (service.avg_time_min || 10) * 3
      : 30;

    let query;
    let params;

    if (serviceId) {
      query = `
        SELECT
          t.*,
          s.name AS service_name,
          s.code AS service_code,
          c.name AS counter_name
        FROM tokens t
        JOIN services s ON t.service_id = s.id
        LEFT JOIN counters c ON t.counter_id = c.id
        WHERE t.status = 'waiting'
          AND t.service_id = ?
          AND t.date_key = ?
        ORDER BY
          CASE
            WHEN t.priority = 2 THEN 3
            WHEN t.priority < 2
              AND (julianday('now') - julianday(t.created_at)) * 24 * 60 > ?
            THEN 2
            WHEN t.priority = 1 THEN 1
            ELSE 0
          END DESC,
          t.created_at ASC,
          t.id ASC
      `;

      params = [serviceId, today, starvationThresholdMinutes];
    } else {
      query = `
        SELECT
          t.*,
          s.name AS service_name,
          s.code AS service_code,
          c.name AS counter_name
        FROM tokens t
        JOIN services s ON t.service_id = s.id
        LEFT JOIN counters c ON t.counter_id = c.id
        WHERE t.status = 'waiting'
          AND t.date_key = ?
        ORDER BY
          CASE
            WHEN t.priority = 2 THEN 3
            WHEN t.priority < 2
              AND (julianday('now') - julianday(t.created_at)) * 24 * 60 > ?
            THEN 2
            WHEN t.priority = 1 THEN 1
            ELSE 0
          END DESC,
          t.created_at ASC,
          t.id ASC
      `;

      params = [today, starvationThresholdMinutes];
    }

    return db.prepare(query).all(...params);
  }

  /**
   * Call the next eligible token for a counter.
   */
  static callNext(counterId) {
    return runTransaction((db) => {
      const counter = db.prepare(`
        SELECT c.*, s.avg_time_min
        FROM counters c
        JOIN services s ON c.service_id = s.id
        WHERE c.id = ? AND c.is_active = 1
      `).get(counterId);

      if (!counter) {
        throw { status: 404, message: 'Counter not found or inactive' };
      }

      const activeToken = db.prepare(`
        SELECT *
        FROM tokens
        WHERE counter_id = ?
          AND status IN ('called', 'serving')
      `).get(counterId);

      if (activeToken) {
        throw {
          status: 409,
          message: 'Counter already has an active token. Complete or skip it first.',
          token: activeToken
        };
      }

      const today = new Date().toISOString().slice(0, 10);
      const starvationThresholdMinutes = (counter.avg_time_min || 10) * 3;

      const nextToken = db.prepare(`
        SELECT *
        FROM tokens
        WHERE service_id = ?
          AND status = 'waiting'
          AND date_key = ?
        ORDER BY
          CASE
            WHEN priority = 2 THEN 3
            WHEN priority < 2
              AND (julianday('now') - julianday(created_at)) * 24 * 60 > ?
            THEN 2
            WHEN priority = 1 THEN 1
            ELSE 0
          END DESC,
          created_at ASC,
          id ASC
        LIMIT 1
      `).get(counter.service_id, today, starvationThresholdMinutes);

      if (!nextToken) {
        throw { status: 404, message: 'No waiting tokens for this service' };
      }

      const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

      const update = db.prepare(`
        UPDATE tokens
        SET status = ?, counter_id = ?, called_at = ?
        WHERE id = ? AND status = 'waiting'
      `).run('called', counterId, now, nextToken.id);

      if (Number(update.changes) !== 1) {
        throw {
          status: 409,
          message: 'Token is no longer waiting. Please try again.'
        };
      }

      db.prepare(`
        INSERT INTO token_events (token_id, event_type, counter_id, details)
        VALUES (?, ?, ?, ?)
      `).run(
        nextToken.id,
        'called',
        counterId,
        `Called to ${counter.name}`
      );

      return db.prepare(`
        SELECT
          t.*,
          s.name AS service_name,
          s.code AS service_code,
          c.name AS counter_name
        FROM tokens t
        JOIN services s ON t.service_id = s.id
        LEFT JOIN counters c ON t.counter_id = c.id
        WHERE t.id = ?
      `).get(nextToken.id);
    });
  }

  /**
   * Recall a token that has already been called.
   */
  static recallToken(tokenId) {
    return runTransaction((db) => {
      const token = db.prepare(
        'SELECT * FROM tokens WHERE id = ?'
      ).get(tokenId);

      if (!token) {
        throw { status: 404, message: 'Token not found' };
      }

      if (token.status !== 'called') {
        throw {
          status: 400,
          message: `Cannot recall a token with status "${token.status}". Token must be in "called" status.`
        };
      }

      db.prepare(`
        INSERT INTO token_events (token_id, event_type, counter_id, details)
        VALUES (?, ?, ?, ?)
      `).run(
        tokenId,
        'recalled',
        token.counter_id,
        'Token recalled'
      );

      return db.prepare(`
        SELECT
          t.*,
          s.name AS service_name,
          s.code AS service_code,
          c.name AS counter_name
        FROM tokens t
        JOIN services s ON t.service_id = s.id
        LEFT JOIN counters c ON t.counter_id = c.id
        WHERE t.id = ?
      `).get(tokenId);
    });
  }

  /**
   * Start serving a token.
   * Status update and event insertion are atomic.
   */
  static startServing(tokenId) {
    return runTransaction((db) => {
      const token = db.prepare(
        'SELECT * FROM tokens WHERE id = ?'
      ).get(tokenId);

      if (!token) {
        throw { status: 404, message: 'Token not found' };
      }

      if (token.status !== 'called') {
        throw {
          status: 400,
          message: `Cannot start serving a token with status "${token.status}". Token must be in "called" status.`
        };
      }

      const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

      const update = db.prepare(`
        UPDATE tokens
        SET status = ?, serving_at = ?
        WHERE id = ? AND status = 'called'
      `).run('serving', now, tokenId);

      if (Number(update.changes) !== 1) {
        throw {
          status: 409,
          message: 'Token status changed. Please refresh and try again.'
        };
      }

      db.prepare(`
        INSERT INTO token_events (token_id, event_type, counter_id, details)
        VALUES (?, ?, ?, ?)
      `).run(
        tokenId,
        'serving',
        token.counter_id,
        'Now serving'
      );

      return db.prepare(`
        SELECT
          t.*,
          s.name AS service_name,
          s.code AS service_code,
          c.name AS counter_name
        FROM tokens t
        JOIN services s ON t.service_id = s.id
        LEFT JOIN counters c ON t.counter_id = c.id
        WHERE t.id = ?
      `).get(tokenId);
    });
  }

  /**
   * Complete a token.
   * Status update and completion event are committed together.
   */
  static completeToken(tokenId) {
    return runTransaction((db) => {
      const token = db.prepare(
        'SELECT * FROM tokens WHERE id = ?'
      ).get(tokenId);

      if (!token) {
        throw { status: 404, message: 'Token not found' };
      }

      if (token.status === 'completed') {
        throw { status: 409, message: 'Token is already completed' };
      }

      if (!['called', 'serving'].includes(token.status)) {
        throw {
          status: 400,
          message: `Cannot complete a token with status "${token.status}". Token must be "called" or "serving".`
        };
      }

      const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

      const update = db.prepare(`
        UPDATE tokens
        SET status = ?, completed_at = ?
        WHERE id = ? AND status IN ('called', 'serving')
      `).run('completed', now, tokenId);

      if (Number(update.changes) !== 1) {
        throw {
          status: 409,
          message: 'Token status changed. Please refresh and try again.'
        };
      }

      db.prepare(`
        INSERT INTO token_events (token_id, event_type, counter_id, details)
        VALUES (?, ?, ?, ?)
      `).run(
        tokenId,
        'completed',
        token.counter_id,
        'Service completed'
      );

      return db.prepare(`
        SELECT
          t.*,
          s.name AS service_name,
          s.code AS service_code,
          c.name AS counter_name
        FROM tokens t
        JOIN services s ON t.service_id = s.id
        LEFT JOIN counters c ON t.counter_id = c.id
        WHERE t.id = ?
      `).get(tokenId);
    });
  }

  /**
   * Skip a token and release its counter assignment.
   * Status update and skip event are atomic.
   */
  static skipToken(tokenId) {
    return runTransaction((db) => {
      const token = db.prepare(
        'SELECT * FROM tokens WHERE id = ?'
      ).get(tokenId);

      if (!token) {
        throw { status: 404, message: 'Token not found' };
      }

      if (!['called', 'serving', 'waiting'].includes(token.status)) {
        throw {
          status: 400,
          message: `Cannot skip a token with status "${token.status}".`
        };
      }

      const update = db.prepare(`
        UPDATE tokens
        SET status = ?,
            counter_id = NULL,
            called_at = NULL,
            serving_at = NULL
        WHERE id = ? AND status IN ('called', 'serving', 'waiting')
      `).run('skipped', tokenId);

      if (Number(update.changes) !== 1) {
        throw {
          status: 409,
          message: 'Token status changed. Please refresh and try again.'
        };
      }

      db.prepare(`
        INSERT INTO token_events (token_id, event_type, counter_id, details)
        VALUES (?, ?, ?, ?)
      `).run(
        tokenId,
        'skipped',
        token.counter_id,
        'Token skipped'
      );

      return db.prepare(`
        SELECT
          t.*,
          s.name AS service_name,
          s.code AS service_code,
          c.name AS counter_name
        FROM tokens t
        JOIN services s ON t.service_id = s.id
        LEFT JOIN counters c ON t.counter_id = c.id
        WHERE t.id = ?
      `).get(tokenId);
    });
  }

  /**
   * Get token by ID with queue position and estimated wait.
   * Queue position uses the same fairness ordering as getQueue().
   */
  static getTokenById(tokenId) {
    const db = getDb();

    const token = db.prepare(`
      SELECT
        t.*,
        s.name AS service_name,
        s.code AS service_code,
        c.name AS counter_name
      FROM tokens t
      JOIN services s ON t.service_id = s.id
      LEFT JOIN counters c ON t.counter_id = c.id
      WHERE t.id = ?
    `).get(tokenId);

    if (!token) {
      throw { status: 404, message: 'Token not found' };
    }

    if (token.status === 'waiting') {
      const waitingQueue = this.getQueue(
        token.service_id,
        token.date_key
      );

      const position = waitingQueue.findIndex(
        (item) => Number(item.id) === Number(token.id)
      );

      token.queue_position = position >= 0 ? position + 1 : null;

      const service = db.prepare(
        'SELECT avg_time_min FROM services WHERE id = ?'
      ).get(token.service_id);

      const activeCounters = db.prepare(`
        SELECT COUNT(*) AS cnt
        FROM counters
        WHERE service_id = ? AND is_active = 1
      `).get(token.service_id);

      const counterCount = Math.max(Number(activeCounters?.cnt || 1), 1);

      token.estimated_wait_min = token.queue_position === null
        ? 0
        : Math.ceil(
            (token.queue_position * (service?.avg_time_min || 10)) /
            counterCount
          );
    }

    return token;
  }

  /**
   * Get token by its public token number.
   */
  static getTokenByNumber(tokenNumber, dateKey) {
    const db = getDb();
    const today = dateKey || new Date().toISOString().slice(0, 10);

    const token = db.prepare(`
      SELECT
        t.*,
        s.name AS service_name,
        s.code AS service_code,
        c.name AS counter_name
      FROM tokens t
      JOIN services s ON t.service_id = s.id
      LEFT JOIN counters c ON t.counter_id = c.id
      WHERE t.token_number = ? AND t.date_key = ?
    `).get(tokenNumber, today);

    if (!token) {
      throw { status: 404, message: 'Token not found' };
    }

    if (token.status === 'waiting') {
      const waitingQueue = this.getQueue(
        token.service_id,
        token.date_key
      );

      const position = waitingQueue.findIndex(
        (item) => Number(item.id) === Number(token.id)
      );

      token.queue_position = position >= 0 ? position + 1 : null;

      const service = db.prepare(
        'SELECT avg_time_min FROM services WHERE id = ?'
      ).get(token.service_id);

      const activeCounters = db.prepare(`
        SELECT COUNT(*) AS cnt
        FROM counters
        WHERE service_id = ? AND is_active = 1
      `).get(token.service_id);

      const counterCount = Math.max(Number(activeCounters?.cnt || 1), 1);

      token.estimated_wait_min = token.queue_position === null
        ? 0
        : Math.ceil(
            (token.queue_position * (service?.avg_time_min || 10)) /
            counterCount
          );
    }

    return token;
  }

  /**
   * Get today's tokens with optional filters.
   */
  static getTokens({ serviceId, status, dateKey, limit = 100 } = {}) {
    const db = getDb();
    const today = dateKey || new Date().toISOString().slice(0, 10);

    let query = `
      SELECT
        t.*,
        s.name AS service_name,
        s.code AS service_code,
        c.name AS counter_name
      FROM tokens t
      JOIN services s ON t.service_id = s.id
      LEFT JOIN counters c ON t.counter_id = c.id
      WHERE t.date_key = ?
    `;

    const params = [today];

    if (serviceId) {
      query += ' AND t.service_id = ?';
      params.push(serviceId);
    }

    if (status) {
      query += ' AND t.status = ?';
      params.push(status);
    }

    query += ' ORDER BY t.created_at DESC LIMIT ?';
    params.push(limit);

    return db.prepare(query).all(...params);
  }

  /**
   * Get a service-specific display for a customer's own token.
   * Ownership is checked using the authenticated account ID.
   */
  static getCustomerDisplayData(tokenId, userId) {
    const db = getDb();

    const token = db.prepare(`
      SELECT
        t.id,
        t.token_number,
        t.service_id,
        t.status,
        t.priority,
        t.created_at,
        t.date_key,
        s.name AS service_name,
        s.code AS service_code,
        s.avg_time_min,
        c.name AS counter_name
      FROM tokens t
      JOIN services s ON t.service_id = s.id
      LEFT JOIN counters c ON t.counter_id = c.id
      WHERE t.id = ? AND t.user_id = ?
    `).get(tokenId, userId);

    // Do not reveal whether a token belongs to another account.
    if (!token) {
      throw { status: 404, message: 'Token not found' };
    }

    const service = {
      id: token.service_id,
      name: token.service_name,
      code: token.service_code
    };

    // Reuse the existing queue ordering and fairness rules.
    const waitingQueue = this.getQueue(
      token.service_id,
      token.date_key
    );

    // Only expose safe fields for the service's active tokens.
    const currentTokens = db.prepare(`
      SELECT
        t.id,
        t.token_number,
        t.status,
        t.priority,
        t.called_at,
        s.name AS service_name,
        s.code AS service_code,
        c.name AS counter_name
      FROM tokens t
      JOIN services s ON t.service_id = s.id
      LEFT JOIN counters c ON t.counter_id = c.id
      WHERE t.service_id = ?
        AND t.date_key = ?
        AND t.status IN ('called', 'serving')
      ORDER BY t.called_at DESC
    `).all(token.service_id, token.date_key);

    // Do not expose other customers' names or account IDs.
    const upcomingTokens = waitingQueue.map((item) => ({
      token_number: item.token_number,
      priority: item.priority,
      service_name: item.service_name,
      service_code: item.service_code
    }));

    let queuePosition = null;
    let estimatedWaitMin = 0;

    if (token.status === 'waiting') {
      const position = waitingQueue.findIndex(
        (item) => Number(item.id) === Number(token.id)
      );

      queuePosition = position >= 0 ? position + 1 : null;

      const activeCounters = db.prepare(`
        SELECT COUNT(*) AS count
        FROM counters
        WHERE service_id = ? AND is_active = 1
      `).get(token.service_id);

      const counterCount = Math.max(
        Number(activeCounters?.count || 1),
        1
      );

      if (queuePosition !== null) {
        estimatedWaitMin = Math.ceil(
          (queuePosition * (token.avg_time_min || 10)) / counterCount
        );
      }
    }

    const ownToken = {
      id: token.id,
      token_number: token.token_number,
      status: token.status,
      priority: token.priority,
      service_name: token.service_name,
      service_code: token.service_code,
      counter_name: token.counter_name,
      created_at: token.created_at,
      queue_position: queuePosition,
      estimated_wait_min: estimatedWaitMin
    };

    const stats = db.prepare(`
      SELECT
        COUNT(CASE WHEN status = 'waiting' THEN 1 END) AS waiting_count,
        COUNT(CASE WHEN status IN ('called', 'serving') THEN 1 END) AS active_count,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) AS completed_count,
        COUNT(*) AS total_count
      FROM tokens
      WHERE service_id = ? AND date_key = ?
    `).get(token.service_id, token.date_key);

    const announcements = db.prepare(`
      SELECT id, message, priority, created_at
      FROM announcements
      WHERE is_active = 1
      ORDER BY priority DESC, created_at DESC
    `).all();

    return {
      service,
      currentTokens,
      upcomingTokens,
      ownToken,
      announcements,
      stats
    };
  }

  /**
   * Get all-service display data for Staff and Admin.
   */
  static getDisplayData() {
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);

    const currentTokens = db.prepare(`
      SELECT
        t.*,
        s.name AS service_name,
        s.code AS service_code,
        c.name AS counter_name
      FROM tokens t
      JOIN services s ON t.service_id = s.id
      LEFT JOIN counters c ON t.counter_id = c.id
      WHERE t.status IN ('called', 'serving')
        AND t.date_key = ?
      ORDER BY t.called_at DESC
    `).all(today);

    const upcomingTokens = db.prepare(`
      SELECT
        t.token_number,
        t.priority,
        s.name AS service_name,
        s.code AS service_code
      FROM tokens t
      JOIN services s ON t.service_id = s.id
      WHERE t.status = 'waiting'
        AND t.date_key = ?
      ORDER BY
        CASE
          WHEN t.priority = 2 THEN 3
          WHEN t.priority < 2
            AND (julianday('now') - julianday(t.created_at)) * 24 * 60 > 30
          THEN 2
          WHEN t.priority = 1 THEN 1
          ELSE 0
        END DESC,
        t.created_at ASC,
        t.id ASC
      LIMIT 10
    `).all(today);

    const announcements = db.prepare(`
      SELECT *
      FROM announcements
      WHERE is_active = 1
      ORDER BY priority DESC, created_at DESC
    `).all();

    const stats = db.prepare(`
      SELECT
        COUNT(CASE WHEN status = 'waiting' THEN 1 END) AS waiting_count,
        COUNT(CASE WHEN status IN ('called', 'serving') THEN 1 END) AS active_count,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) AS completed_count,
        COUNT(*) AS total_count
      FROM tokens
      WHERE date_key = ?
    `).get(today);

    return { currentTokens, upcomingTokens, announcements, stats };
  }
}

module.exports = TokenService;
