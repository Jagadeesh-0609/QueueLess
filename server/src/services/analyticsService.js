
const { getDb } = require('../config/database');

function roundMinutes(value) {
  if (value == null || !Number.isFinite(Number(value))) {
    return 0;
  }

  return Math.round(Number(value) * 10) / 10;
}

function isValidDateKey(dateKey) {
  if (typeof dateKey !== 'string') {
    return false;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return false;
  }

  const date = new Date(`${dateKey}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === dateKey
  );
}

function getDateRange(dateKey) {
  const endDate = new Date(`${dateKey}T00:00:00.000Z`);

  endDate.setUTCDate(endDate.getUTCDate() - 6);

  return {
    start: endDate.toISOString().slice(0, 10),
    end: dateKey,
  };
}

function buildDailyTrend(rows, startDate, endDate) {
  const rowsByDate = new Map(
    rows.map((row) => [row.date_key, row]),
  );

  const result = [];
  const current = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);

  while (current <= end) {
    const dateKey = current.toISOString().slice(0, 10);
    const row = rowsByDate.get(dateKey) || {};

    result.push({
      date_key: dateKey,
      total: Number(row.total) || 0,
      completed: Number(row.completed) || 0,
      waiting: Number(row.waiting) || 0,
      active: Number(row.active) || 0,
      skipped: Number(row.skipped) || 0,
      cancelled: Number(row.cancelled) || 0,
    });

    current.setUTCDate(current.getUTCDate() + 1);
  }

  return result;
}

class AnalyticsService {
  static getDashboard(dateKey) {
    const db = getDb();

    const today = dateKey || new Date().toISOString().slice(0, 10);

    if (!isValidDateKey(today)) {
      const error = new Error('Invalid date. Expected YYYY-MM-DD.');
      error.status = 400;
      throw error;
    }

    const { start, end } = getDateRange(today);

    // --------------------------------------------------
    // Overview statistics
    // --------------------------------------------------

    const overview = db.prepare(`
      SELECT
        COUNT(*) AS total_tokens,

        COUNT(CASE
          WHEN status = 'completed' THEN 1
        END) AS completed_tokens,

        COUNT(CASE
          WHEN status = 'waiting' THEN 1
        END) AS waiting_tokens,

        COUNT(CASE
          WHEN status IN ('called', 'serving') THEN 1
        END) AS active_tokens,

        COUNT(CASE
          WHEN status = 'skipped' THEN 1
        END) AS skipped_tokens,

        COUNT(CASE
          WHEN status = 'cancelled' THEN 1
        END) AS cancelled_tokens

      FROM tokens
      WHERE date_key = ?
    `).get(today);

    // --------------------------------------------------
    // Waiting time statistics
    // Includes every token that has been called.
    // --------------------------------------------------

    const waitTime = db.prepare(`
      SELECT
        AVG(
          (julianday(called_at) - julianday(created_at))
          * 24 * 60
        ) AS avg_wait_min,

        MIN(
          (julianday(called_at) - julianday(created_at))
          * 24 * 60
        ) AS min_wait_min,

        MAX(
          (julianday(called_at) - julianday(created_at))
          * 24 * 60
        ) AS max_wait_min

      FROM tokens
      WHERE date_key = ?
        AND called_at IS NOT NULL
    `).get(today);

    // --------------------------------------------------
    // Service duration statistics
    // --------------------------------------------------

    const serviceDuration = db.prepare(`
      SELECT
        AVG(
          (julianday(completed_at) -
          julianday(COALESCE(serving_at, called_at)))
          * 24 * 60
        ) AS avg_service_min,

        MIN(
          (julianday(completed_at) -
          julianday(COALESCE(serving_at, called_at)))
          * 24 * 60
        ) AS min_service_min,

        MAX(
          (julianday(completed_at) -
          julianday(COALESCE(serving_at, called_at)))
          * 24 * 60
        ) AS max_service_min

      FROM tokens
      WHERE date_key = ?
        AND status = 'completed'
        AND completed_at IS NOT NULL
        AND COALESCE(serving_at, called_at) IS NOT NULL
    `).get(today);

    // --------------------------------------------------
    // Service-wise statistics
    // --------------------------------------------------

    const perService = db.prepare(`
      SELECT
        s.id AS service_id,
        s.name AS service_name,
        s.code AS service_code,

        COUNT(*) AS total,

        COUNT(CASE
          WHEN t.status = 'completed' THEN 1
        END) AS completed,

        COUNT(CASE
          WHEN t.status = 'waiting' THEN 1
        END) AS waiting,

        COUNT(CASE
          WHEN t.status IN ('called', 'serving') THEN 1
        END) AS active,

        COUNT(CASE
          WHEN t.status = 'skipped' THEN 1
        END) AS skipped,

        COUNT(CASE
          WHEN t.status = 'cancelled' THEN 1
        END) AS cancelled,

        AVG(
          CASE
            WHEN t.called_at IS NOT NULL
            THEN (
              julianday(t.called_at) -
              julianday(t.created_at)
            ) * 24 * 60
          END
        ) AS avg_wait_min,

        AVG(
          CASE
            WHEN t.status = 'completed'
              AND t.completed_at IS NOT NULL
              AND COALESCE(t.serving_at, t.called_at) IS NOT NULL
            THEN (
              julianday(t.completed_at) -
              julianday(COALESCE(t.serving_at, t.called_at))
            ) * 24 * 60
          END
        ) AS avg_service_min

      FROM tokens t
      JOIN services s ON t.service_id = s.id

      WHERE t.date_key = ?

      GROUP BY s.id, s.name, s.code
      ORDER BY total DESC, s.name ASC
    `).all(today);

    // --------------------------------------------------
    // Counter performance
    // --------------------------------------------------

    const perCounter = db.prepare(`
      SELECT
        c.id AS counter_id,
        c.name AS counter_name,
        s.name AS service_name,

        COUNT(*) AS assigned_tokens,

        COUNT(CASE
          WHEN t.status = 'completed' THEN 1
        END) AS completed,

        COUNT(CASE
          WHEN t.status IN ('called', 'serving') THEN 1
        END) AS active,

        COUNT(CASE
          WHEN t.status = 'waiting' THEN 1
        END) AS waiting,

        COUNT(CASE
          WHEN t.status = 'skipped' THEN 1
        END) AS skipped,

        COUNT(CASE
          WHEN t.status = 'cancelled' THEN 1
        END) AS cancelled,

        AVG(
          CASE
            WHEN t.status = 'completed'
              AND t.completed_at IS NOT NULL
              AND COALESCE(t.serving_at, t.called_at) IS NOT NULL
            THEN (
              julianday(t.completed_at) -
              julianday(COALESCE(t.serving_at, t.called_at))
            ) * 24 * 60
          END
        ) AS avg_service_min

      FROM tokens t
      JOIN counters c ON t.counter_id = c.id
      JOIN services s ON c.service_id = s.id

      WHERE t.date_key = ?

      GROUP BY c.id, c.name, s.name
      ORDER BY completed DESC, c.name ASC
    `).all(today);

    // --------------------------------------------------
    // Hourly token volume - all 24 hours
    // --------------------------------------------------

    const hourlyRows = db.prepare(`
      SELECT
        CAST(strftime('%H', created_at) AS INTEGER) AS hour,
        COUNT(*) AS count

      FROM tokens
      WHERE date_key = ?

      GROUP BY strftime('%H', created_at)
      ORDER BY hour ASC
    `).all(today);

    const hourlyMap = new Map(
      hourlyRows.map((row) => [
        Number(row.hour),
        Number(row.count),
      ]),
    );

    const hourly = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      count: hourlyMap.get(hour) || 0,
    }));

    // --------------------------------------------------
    // Priority distribution
    // --------------------------------------------------

    const priorityDist = db.prepare(`
      SELECT
        CASE priority
          WHEN 0 THEN 'Normal'
          WHEN 1 THEN 'High'
          WHEN 2 THEN 'Urgent'
          ELSE 'Other'
        END AS priority_label,

        COUNT(*) AS count

      FROM tokens
      WHERE date_key = ?

      GROUP BY priority
      ORDER BY priority ASC
    `).all(today);

    // --------------------------------------------------
    // Seven-day daily trend
    // --------------------------------------------------

    const dailyRows = db.prepare(`
      SELECT
        date_key,

        COUNT(*) AS total,

        COUNT(CASE
          WHEN status = 'completed' THEN 1
        END) AS completed,

        COUNT(CASE
          WHEN status = 'waiting' THEN 1
        END) AS waiting,

        COUNT(CASE
          WHEN status IN ('called', 'serving') THEN 1
        END) AS active,

        COUNT(CASE
          WHEN status = 'skipped' THEN 1
        END) AS skipped,

        COUNT(CASE
          WHEN status = 'cancelled' THEN 1
        END) AS cancelled

      FROM tokens

      WHERE date_key BETWEEN ? AND ?

      GROUP BY date_key
      ORDER BY date_key ASC
    `).all(start, end);

    const dailyCounts = buildDailyTrend(
      dailyRows,
      start,
      end,
    );

    // --------------------------------------------------
    // Response
    // --------------------------------------------------

    return {
      date: today,

      dateRange: {
        start,
        end,
      },

      overview: {
        total_tokens: Number(overview.total_tokens) || 0,
        completed_tokens: Number(overview.completed_tokens) || 0,
        waiting_tokens: Number(overview.waiting_tokens) || 0,
        active_tokens: Number(overview.active_tokens) || 0,
        skipped_tokens: Number(overview.skipped_tokens) || 0,
        cancelled_tokens: Number(overview.cancelled_tokens) || 0,
      },

      waitTime: {
        avg: roundMinutes(waitTime.avg_wait_min),
        min: roundMinutes(waitTime.min_wait_min),
        max: roundMinutes(waitTime.max_wait_min),
      },

      serviceDuration: {
        avg: roundMinutes(serviceDuration.avg_service_min),
        min: roundMinutes(serviceDuration.min_service_min),
        max: roundMinutes(serviceDuration.max_service_min),
      },

      perService: perService.map((service) => ({
        ...service,
        total: Number(service.total) || 0,
        completed: Number(service.completed) || 0,
        waiting: Number(service.waiting) || 0,
        active: Number(service.active) || 0,
        skipped: Number(service.skipped) || 0,
        cancelled: Number(service.cancelled) || 0,
        avg_wait_min:
          service.avg_wait_min == null
            ? null
            : roundMinutes(service.avg_wait_min),
        avg_service_min:
          service.avg_service_min == null
            ? null
            : roundMinutes(service.avg_service_min),
      })),

      perCounter: perCounter.map((counter) => ({
        ...counter,
        assigned_tokens: Number(counter.assigned_tokens) || 0,
        completed: Number(counter.completed) || 0,
        active: Number(counter.active) || 0,
        waiting: Number(counter.waiting) || 0,
        skipped: Number(counter.skipped) || 0,
        cancelled: Number(counter.cancelled) || 0,
        avg_service_min:
          counter.avg_service_min == null
            ? null
            : roundMinutes(counter.avg_service_min),
      })),

      hourly: hourly.map((item) => ({
        hour: Number(item.hour),
        count: Number(item.count) || 0,
      })),

      priorityDist: priorityDist.map((item) => ({
        priority_label: item.priority_label,
        count: Number(item.count) || 0,
      })),

      dailyCounts,
    };
  }
}

module.exports = AnalyticsService;
