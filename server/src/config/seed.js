
/**
 * QueueLess - Demo Database Seed Script
 *
 * Run with:
 *   npm run seed -- --reset-demo-data
 *
 * WARNING:
 * This script deletes existing tokens, token events, counters,
 * services and announcements before inserting demonstration data.
 *
 * Existing user accounts are preserved.
 */

require('dotenv').config();

const readline = require('readline');
const {
  getDb,
  initializeSchema,
  closeDb,
} = require('./database');

const RESET_FLAG = '--reset-demo-data';

function askConfirmation(question) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      reject(
        new Error('Run this script in an interactive terminal.')
      );
      return;
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function timeAgo(minutesAgo) {
  const date = new Date(Date.now() - minutesAgo * 60 * 1000);
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

function seedDatabase(db) {
  const today = new Date().toISOString().slice(0, 10);

  // Clear operational data in dependency order.
  // User accounts are intentionally preserved.
  db.exec(`
    DELETE FROM token_events;
    DELETE FROM tokens;
    DELETE FROM counters;
    DELETE FROM services;
    DELETE FROM announcements;
  `);

  // Services
  const insertService = db.prepare(`
    INSERT INTO services (name, code, description, avg_time_min)
    VALUES (?, ?, ?, ?)
  `);

  const services = [
    ['General Inquiry', 'GEN', 'General questions and information', 5],
    ['Billing & Payments', 'BIL', 'Payment processing and billing issues', 8],
    ['Technical Support', 'TEC', 'Technical assistance and troubleshooting', 15],
    ['Account Services', 'ACC', 'Account creation, updates and closures', 10],
    ['Document Processing', 'DOC', 'Document verification and processing', 12],
  ];

  const serviceIds = {};

  for (const [name, code, description, avgTime] of services) {
    const result = insertService.run(
      name,
      code,
      description,
      avgTime
    );

    serviceIds[code] = result.lastInsertRowid;
  }

  // Counters
  const insertCounter = db.prepare(`
    INSERT INTO counters (name, service_id)
    VALUES (?, ?)
  `);

  const counters = [
    ['Counter 1', serviceIds.GEN],
    ['Counter 2', serviceIds.GEN],
    ['Counter 3', serviceIds.BIL],
    ['Counter 4', serviceIds.BIL],
    ['Counter 5', serviceIds.TEC],
    ['Counter 6', serviceIds.ACC],
    ['Counter 7', serviceIds.DOC],
  ];

  const counterIds = {};

  for (const [name, serviceId] of counters) {
    const result = insertCounter.run(name, serviceId);
    counterIds[name] = result.lastInsertRowid;
  }

  // Demo tokens
  const insertToken = db.prepare(`
    INSERT INTO tokens (
      token_number,
      daily_number,
      service_id,
      counter_id,
      status,
      priority,
      customer_name,
      created_at,
      called_at,
      serving_at,
      completed_at,
      date_key
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertEvent = db.prepare(`
    INSERT INTO token_events (
      token_id,
      event_type,
      counter_id,
      details,
      created_at
    )
    VALUES (?, ?, ?, ?, ?)
  `);

  const demoTokens = [
    // Completed
    { num: 'GEN-001', daily: 1, svc: 'GEN', counter: 'Counter 1', status: 'completed', priority: 0, name: 'Alice', createdAgo: 120, calledAgo: 115, servingAgo: 114, completedAgo: 108 },
    { num: 'GEN-002', daily: 2, svc: 'GEN', counter: 'Counter 2', status: 'completed', priority: 0, name: 'Bob', createdAgo: 110, calledAgo: 105, servingAgo: 104, completedAgo: 98 },
    { num: 'BIL-001', daily: 1, svc: 'BIL', counter: 'Counter 3', status: 'completed', priority: 1, name: 'Carol', createdAgo: 100, calledAgo: 95, servingAgo: 94, completedAgo: 82 },
    { num: 'TEC-001', daily: 1, svc: 'TEC', counter: 'Counter 5', status: 'completed', priority: 0, name: 'Dave', createdAgo: 95, calledAgo: 90, servingAgo: 89, completedAgo: 70 },

    // Currently serving
    { num: 'GEN-003', daily: 3, svc: 'GEN', counter: 'Counter 1', status: 'serving', priority: 0, name: 'Eve', createdAgo: 60, calledAgo: 20, servingAgo: 19 },
    { num: 'BIL-002', daily: 2, svc: 'BIL', counter: 'Counter 3', status: 'serving', priority: 0, name: 'Frank', createdAgo: 55, calledAgo: 18, servingAgo: 17 },

    // Called
    { num: 'TEC-002', daily: 2, svc: 'TEC', counter: 'Counter 5', status: 'called', priority: 0, name: 'Grace', createdAgo: 50, calledAgo: 5 },

    // Waiting
    { num: 'GEN-004', daily: 4, svc: 'GEN', counter: null, status: 'waiting', priority: 2, name: 'Hank (URGENT)', createdAgo: 30 },
    { num: 'GEN-005', daily: 5, svc: 'GEN', counter: null, status: 'waiting', priority: 1, name: 'Ivy (HIGH)', createdAgo: 25 },
    { num: 'GEN-006', daily: 6, svc: 'GEN', counter: null, status: 'waiting', priority: 0, name: 'Jack', createdAgo: 20 },
    { num: 'BIL-003', daily: 3, svc: 'BIL', counter: null, status: 'waiting', priority: 0, name: 'Karen', createdAgo: 15 },
    { num: 'ACC-001', daily: 1, svc: 'ACC', counter: null, status: 'waiting', priority: 0, name: 'Leo', createdAgo: 10 },
    { num: 'DOC-001', daily: 1, svc: 'DOC', counter: null, status: 'waiting', priority: 0, name: 'Mona', createdAgo: 8 },
    { num: 'GEN-007', daily: 7, svc: 'GEN', counter: null, status: 'waiting', priority: 0, name: 'Nate', createdAgo: 5 },
    { num: 'TEC-003', daily: 3, svc: 'TEC', counter: null, status: 'waiting', priority: 1, name: 'Olivia (HIGH)', createdAgo: 3 },

    // Skipped
    { num: 'GEN-008', daily: 8, svc: 'GEN', counter: null, status: 'skipped', priority: 0, name: 'Pete', createdAgo: 90, calledAgo: 85 },
  ];

  for (const token of demoTokens) {
    const serviceId = serviceIds[token.svc];
    const counterId = token.counter
      ? counterIds[token.counter]
      : null;

    const createdAt = timeAgo(token.createdAgo);
    const calledAt = token.calledAgo !== undefined
      ? timeAgo(token.calledAgo)
      : null;
    const servingAt = token.servingAgo !== undefined
      ? timeAgo(token.servingAgo)
      : null;
    const completedAt = token.completedAgo !== undefined
      ? timeAgo(token.completedAgo)
      : null;

    const result = insertToken.run(
      token.num,
      token.daily,
      serviceId,
      counterId,
      token.status,
      token.priority,
      token.name,
      createdAt,
      calledAt,
      servingAt,
      completedAt,
      today
    );

    const tokenId = result.lastInsertRowid;

    insertEvent.run(
      tokenId,
      'created',
      null,
      `Token ${token.num} created`,
      createdAt
    );

    if (calledAt) {
      insertEvent.run(
        tokenId,
        'called',
        counterId,
        `Called to ${token.counter || 'counter'}`,
        calledAt
      );
    }

    if (servingAt) {
      insertEvent.run(
        tokenId,
        'serving',
        counterId,
        `Now serving at ${token.counter || 'counter'}`,
        servingAt
      );
    }

    if (completedAt) {
      insertEvent.run(
        tokenId,
        'completed',
        counterId,
        `Completed at ${token.counter || 'counter'}`,
        completedAt
      );
    }

    if (token.status === 'skipped') {
      insertEvent.run(
        tokenId,
        'skipped',
        counterId,
        'Token was skipped',
        calledAt || createdAt
      );
    }
  }

  // Announcements
  const insertAnnouncement = db.prepare(`
    INSERT INTO announcements (message, is_active, priority)
    VALUES (?, ?, ?)
  `);

  insertAnnouncement.run(
    'Welcome to QueueLess! Please take a token to join the queue.',
    1,
    0
  );

  insertAnnouncement.run(
    'Counter 2 is temporarily closed for maintenance.',
    1,
    1
  );

  insertAnnouncement.run(
    'Holiday hours: We close at 3:00 PM on weekends.',
    1,
    0
  );

  console.log('\nDatabase seeded successfully!');
  console.log(`Services: ${services.length}`);
  console.log(`Counters: ${counters.length}`);
  console.log(`Tokens: ${demoTokens.length}`);
  console.log(`Date key: ${today}`);
}

async function seed() {
  let transactionStarted = false;

  try {
    if (!process.argv.includes(RESET_FLAG)) {
      throw new Error(
        `Destructive seeding is disabled by default.\n` +
        `To proceed intentionally, run:\n` +
        `npm run seed -- ${RESET_FLAG}`
      );
    }

    console.log('\nWARNING: This operation will delete existing:');
    console.log('- Tokens and token history');
    console.log('- Services and counters');
    console.log('- Announcements');
    console.log('User accounts will be preserved.\n');

    const confirmation = await askConfirmation(
      'Type RESET to continue: '
    );

    if (confirmation !== 'RESET') {
      throw new Error('Seed operation cancelled. No changes made.');
    }

    const db = initializeSchema(getDb());

    db.exec('BEGIN IMMEDIATE');
    transactionStarted = true;

    seedDatabase(db);

    db.exec('COMMIT');
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) {
      try {
        const db = getDb();
        db.exec('ROLLBACK');
      } catch (rollbackError) {
        console.error(
          'Rollback failed:',
          rollbackError.message
        );
      }
    }

    throw error;
  } finally {
    try {
      closeDb();
    } catch (error) {
      console.error(
        'Database close warning:',
        error.message
      );
    }
  }
}

seed().catch((error) => {
  console.error('\nSeed failed:', error.message);
  process.exitCode = 1;
});
