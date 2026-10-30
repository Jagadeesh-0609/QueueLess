
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

let db = null;

/**
 * Get or create the SQLite database connection.
 * @param {string} [dbPath] - Optional path override for tests.
 * @returns {DatabaseSync}
 */
function getDb(dbPath) {
  if (db) return db;

  const configuredPath =
    dbPath || process.env.DB_PATH || './data/queueless.db';

  if (
    typeof configuredPath !== 'string' ||
    !configuredPath.trim()
  ) {
    throw new Error('A valid database path must be configured.');
  }

  // Preserve SQLite's special in-memory database path.
  const fullPath =
    configuredPath === ':memory:'
      ? ':memory:'
      : path.resolve(configuredPath);

  if (fullPath !== ':memory:') {
    const dir = path.dirname(fullPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const connection = new DatabaseSync(fullPath);

  try {
    connection.exec('PRAGMA journal_mode = WAL');
    connection.exec('PRAGMA foreign_keys = ON');
    connection.exec('PRAGMA busy_timeout = 5000');

    db = connection;
    return db;
  } catch (error) {
    try {
      connection.close();
    } catch {
      // Preserve the original initialization error.
    }

    throw error;
  }
}

/**
 * Initialize database tables and indexes.
 * Existing tables and records are preserved.
 * @param {DatabaseSync} [database]
 * @returns {DatabaseSync}
 */
function initializeSchema(database) {
  const targetDb = database || getDb();

  targetDb.exec(`
    -- User accounts and role-based access
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name     TEXT NOT NULL,
      email         TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'customer'
                    CHECK (role IN ('customer', 'staff', 'admin')),
      is_active     INTEGER NOT NULL DEFAULT 1
                    CHECK (is_active IN (0, 1)),
      created_at    TEXT DEFAULT (datetime('now')),
      updated_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_users_role
      ON users(role);

    CREATE INDEX IF NOT EXISTS idx_users_active
      ON users(is_active);

    -- Services offered by the organization
    CREATE TABLE IF NOT EXISTS services (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL UNIQUE,
      code          TEXT NOT NULL UNIQUE,
      description   TEXT DEFAULT '',
      avg_time_min  INTEGER DEFAULT 10,
      is_active     INTEGER DEFAULT 1,
      created_at    TEXT DEFAULT (datetime('now'))
    );

    -- Counters / service windows
    CREATE TABLE IF NOT EXISTS counters (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL UNIQUE,
      service_id    INTEGER NOT NULL,
      is_active     INTEGER DEFAULT 1,
      created_at    TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (service_id) REFERENCES services(id)
    );

    -- Tokens (queue entries)
    CREATE TABLE IF NOT EXISTS tokens (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      token_number  TEXT NOT NULL,
      daily_number  INTEGER NOT NULL,
      service_id    INTEGER NOT NULL,
      counter_id    INTEGER,
      status        TEXT NOT NULL DEFAULT 'waiting',
      priority      INTEGER NOT NULL DEFAULT 0,
      customer_name TEXT DEFAULT '',
      created_at    TEXT DEFAULT (datetime('now')),
      called_at     TEXT,
      serving_at    TEXT,
      completed_at  TEXT,
      date_key      TEXT NOT NULL,
      user_id       INTEGER,
      FOREIGN KEY (service_id) REFERENCES services(id),
      FOREIGN KEY (counter_id) REFERENCES counters(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- Token events for audit trail
    CREATE TABLE IF NOT EXISTS token_events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      token_id    INTEGER NOT NULL,
      event_type  TEXT NOT NULL,
      counter_id  INTEGER,
      details     TEXT DEFAULT '',
      created_at  TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (token_id) REFERENCES tokens(id),
      FOREIGN KEY (counter_id) REFERENCES counters(id)
    );

    -- Announcements for the public display
    CREATE TABLE IF NOT EXISTS announcements (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      message     TEXT NOT NULL,
      is_active   INTEGER DEFAULT 1,
      priority    INTEGER DEFAULT 0,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    -- Existing indexes
    CREATE INDEX IF NOT EXISTS idx_tokens_status
      ON tokens(status);

    CREATE INDEX IF NOT EXISTS idx_tokens_date_key
      ON tokens(date_key);

    CREATE INDEX IF NOT EXISTS idx_tokens_service
      ON tokens(service_id, status, priority DESC, created_at ASC);

    CREATE INDEX IF NOT EXISTS idx_tokens_counter
      ON tokens(counter_id, status);

    CREATE INDEX IF NOT EXISTS idx_token_events_token
      ON token_events(token_id);

    CREATE INDEX IF NOT EXISTS idx_counters_service
      ON counters(service_id);
  `);

  // Safely migrate existing databases.
  // CREATE TABLE IF NOT EXISTS does not add columns to existing tables.
  const tokenColumns = targetDb
    .prepare('PRAGMA table_info(tokens)')
    .all();

  const hasUserId = tokenColumns.some(
    (column) => column.name === 'user_id'
  );

  if (!hasUserId) {
    targetDb.exec(`
      ALTER TABLE tokens
      ADD COLUMN user_id INTEGER REFERENCES users(id);
    `);
  }

  // Index for customer-specific token queries.
  targetDb.exec(`
    CREATE INDEX IF NOT EXISTS idx_tokens_user_id
    ON tokens(user_id);
  `);

  return targetDb;
}

/**
 * Close the database connection.
 */
function closeDb() {
  if (db) {
    const connection = db;
    db = null;
    connection.close();
  }
}

/**
 * Reset the module-level database reference (used in tests).
 * Closes the previous connection before resetting.
 */
function resetDb() {
  closeDb();
}

/**
 * Run a synchronous function inside a transaction.
 * @param {Function} fn
 * @returns {*}
 */
function runTransaction(fn) {
  if (typeof fn !== 'function') {
    throw new TypeError('Transaction callback must be a function.');
  }

  const database = getDb();

  database.exec('BEGIN');

  try {
    const result = fn(database);

    if (result && typeof result.then === 'function') {
      throw new TypeError(
        'runTransaction only supports synchronous callbacks.'
      );
    }

    database.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      database.exec('ROLLBACK');
    } catch (rollbackError) {
      // Preserve the original transaction error.
      error.rollbackError = rollbackError;
    }

    throw error;
  }
}

module.exports = {
  getDb,
  initializeSchema,
  closeDb,
  resetDb,
  runTransaction,
};
