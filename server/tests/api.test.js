/**
 * QueueLess API Tests
 *
 * Covers:
 * - Authentication and role-based access
 * - Customer token creation and ownership
 * - Queue ordering and priority
 * - Staff/Admin token operations
 * - Customer-specific display
 * - Analytics and all-service display
 * - Transaction rollback safety
 */

const request = require('supertest');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// --------------------------------------------------
// Test environment
// --------------------------------------------------

process.env.NODE_ENV = 'test';
process.env.DB_PATH = './data/test-queueless.db';
process.env.CORS_ORIGIN = '*';
process.env.JWT_SECRET =
  'queueless-test-secret-key-minimum-32-characters-long';

const {
  initializeSchema,
  closeDb,
  resetDb,
  getDb,
} = require('../src/config/database');

const DB_PATH = path.resolve(process.env.DB_PATH);

let app;
let customer;
let secondCustomer;
let staff;
let admin;

let customerToken;
let secondCustomerToken;
let staffToken;
let adminToken;

// --------------------------------------------------
// Authentication helpers
// --------------------------------------------------

function generateJwt(user) {
  return jwt.sign(
    { role: user.role },
    process.env.JWT_SECRET,
    {
      subject: String(user.id),
      expiresIn: '2h',
      issuer: 'queueless',
    }
  );
}

function authenticatedRequest(roleToken, method, url) {
  return request(app)[method](url)
    .set('Authorization', `Bearer ${roleToken}`);
}

function createUser(fullName, email, role) {
  const db = getDb();

  const passwordHash = bcrypt.hashSync(
    'TestPassword@123',
    10
  );

  const result = db.prepare(`
    INSERT INTO users (
      full_name,
      email,
      password_hash,
      role,
      is_active
    )
    VALUES (?, ?, ?, ?, 1)
  `).run(
    fullName,
    email,
    passwordHash,
    role
  );

  const user = {
    id: Number(result.lastInsertRowid),
    full_name: fullName,
    email,
    role,
  };

  return {
    ...user,
    jwt: generateJwt(user),
  };
}

// --------------------------------------------------
// Database helpers
// --------------------------------------------------

function createService(name, code, averageTime = 5) {
  const result = getDb().prepare(`
    INSERT INTO services (
      name,
      code,
      description,
      avg_time_min
    )
    VALUES (?, ?, ?, ?)
  `).run(
    name,
    code,
    `${name} test service`,
    averageTime
  );

  return Number(result.lastInsertRowid);
}

function createCounter(name, serviceId) {
  const result = getDb().prepare(`
    INSERT INTO counters (name, service_id)
    VALUES (?, ?)
  `).run(name, serviceId);

  return Number(result.lastInsertRowid);
}

async function createCustomerToken(
  roleToken,
  serviceId,
  priority = 0
) {
  return authenticatedRequest(
    roleToken,
    'post',
    '/api/tokens'
  ).send({
    service_id: serviceId,
    priority,
  });
}

// --------------------------------------------------
// Global setup
// --------------------------------------------------

beforeAll(async () => {
  // Remove the previous test database.
  closeDb();
  resetDb();

  for (const suffix of ['', '-wal', '-shm']) {
    const file = `${DB_PATH}${suffix}`;

    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  }

  // Initialize a clean test database.
  initializeSchema();

  // Create test accounts for all three roles.
  customer = createUser(
    'Test Customer',
    'customer@test.local',
    'customer'
  );

  secondCustomer = createUser(
    'Second Customer',
    'customer2@test.local',
    'customer'
  );

  staff = createUser(
    'Test Staff',
    'staff@test.local',
    'staff'
  );

  admin = createUser(
    'Test Admin',
    'admin@test.local',
    'admin'
  );

  customerToken = customer.jwt;
  secondCustomerToken = secondCustomer.jwt;
  staffToken = staff.jwt;
  adminToken = admin.jwt;

  // Import the application after environment and database setup.
  const serverModule = require('../src/index');
  app = serverModule.app;
});

afterAll(() => {
  closeDb();
  resetDb();

  for (const suffix of ['', '-wal', '-shm']) {
    const file = `${DB_PATH}${suffix}`;

    if (fs.existsSync(file)) {
      try {
        fs.unlinkSync(file);
      } catch (error) {
        // Ignore cleanup errors.
      }
    }
  }
});

// --------------------------------------------------
// Services API
// --------------------------------------------------

describe('Services API', () => {
  test('GET /api/services should return an array initially', async () => {
    const response = await request(app)
      .get('/api/services');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });
});

// --------------------------------------------------
// Authentication and role protection
// --------------------------------------------------

describe('Authentication and Role Protection', () => {
  test('Reject requests without an access token', async () => {
    const response = await request(app)
      .get('/api/tokens/queue');

    expect(response.status).toBe(401);
  });

  test('Reject invalid JWT', async () => {
    const response = await request(app)
      .get('/api/tokens/queue')
      .set('Authorization', 'Bearer invalid-token');

    expect(response.status).toBe(401);
  });

  test('Customer cannot access staff token listing', async () => {
    const response = await authenticatedRequest(
      customerToken,
      'get',
      '/api/tokens'
    );

    expect(response.status).toBe(403);
  });

  test('Customer cannot access all-service queue', async () => {
    const response = await authenticatedRequest(
      customerToken,
      'get',
      '/api/tokens/queue'
    );

    expect(response.status).toBe(403);
  });

  test('Customer cannot access all-service display', async () => {
    const response = await authenticatedRequest(
      customerToken,
      'get',
      '/api/tokens/display'
    );

    expect(response.status).toBe(403);
  });

  test('Staff can access all-service queue', async () => {
    const response = await authenticatedRequest(
      staffToken,
      'get',
      '/api/tokens/queue'
    );

    expect(response.status).toBe(200);
  });

  test('Admin can access all-service queue', async () => {
    const response = await authenticatedRequest(
      adminToken,
      'get',
      '/api/tokens/queue'
    );

    expect(response.status).toBe(200);
  });
});

// --------------------------------------------------
// Token lifecycle
// --------------------------------------------------

describe('Token Lifecycle', () => {
  let serviceId;
  let counterId;
  let tokenId;
  let secondTokenId;

  beforeAll(() => {
    serviceId = createService(
      'Test Service',
      'TST',
      5
    );

    counterId = createCounter(
      'Test Counter 1',
      serviceId
    );
  });

  test('Customer can create a token', async () => {
    const response = await createCustomerToken(
      customerToken,
      serviceId
    );

    expect(response.status).toBe(201);
    expect(response.body.token_number).toBe('TST-001');
    expect(response.body.status).toBe('waiting');
    expect(response.body.priority).toBe(0);
    expect(response.body.user_id).toBe(customer.id);

    tokenId = response.body.id;
  });

  test('Customer can create a second token', async () => {
    const response = await createCustomerToken(
      customerToken,
      serviceId
    );

    expect(response.status).toBe(201);
    expect(response.body.token_number).toBe('TST-002');

    secondTokenId = response.body.id;
  });

  test('Customer cannot create a token for an invalid service', async () => {
    const response = await createCustomerToken(
      customerToken,
      99999
    );

    expect(response.status).toBe(404);
  });

  test('Token creation rejects missing service_id', async () => {
    const response = await authenticatedRequest(
      customerToken,
      'post',
      '/api/tokens'
    ).send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('service_id');
  });

  test('Token creation ignores customer_name supplied in request body', async () => {
    const response = await authenticatedRequest(
      customerToken,
      'post',
      '/api/tokens'
    ).send({
      service_id: serviceId,
      customer_name: 'Forged Customer Name',
    });

    expect(response.status).toBe(201);
    expect(response.body.customer_name).toBe('Test Customer');
  });

  test('Token creation ignores user_id supplied in request body', async () => {
    const response = await authenticatedRequest(
      customerToken,
      'post',
      '/api/tokens'
    ).send({
      service_id: serviceId,
      user_id: secondCustomer.id,
    });

    expect(response.status).toBe(201);
    expect(response.body.user_id).toBe(customer.id);
  });

  test('Staff can retrieve waiting queue', async () => {
    const response = await authenticatedRequest(
      staffToken,
      'get',
      `/api/tokens/queue?service_id=${serviceId}`
    );

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThanOrEqual(2);
  });

  test('Customer can retrieve their own token details', async () => {
    const response = await authenticatedRequest(
      customerToken,
      'get',
      `/api/tokens/${tokenId}`
    );

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(tokenId);
    expect(response.body.queue_position).toBeDefined();
    expect(response.body.estimated_wait_min).toBeDefined();
    expect(response.body.user_id).toBeUndefined();
  });

  test('Customer cannot retrieve another customer token', async () => {
    const response = await authenticatedRequest(
      secondCustomerToken,
      'get',
      `/api/tokens/${tokenId}`
    );

    expect(response.status).toBe(403);
  });

  test('Customer cannot retrieve another customer event timeline', async () => {
    const response = await authenticatedRequest(
      secondCustomerToken,
      'get',
      `/api/tokens/${tokenId}/events`
    );

    expect(response.status).toBe(403);
  });

  test('Staff can retrieve token details for operations', async () => {
    const response = await authenticatedRequest(
      staffToken,
      'get',
      `/api/tokens/${tokenId}`
    );

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(tokenId);
  });

  test('Staff can call the next token', async () => {
    const response = await authenticatedRequest(
      staffToken,
      'post',
      `/api/tokens/call/${counterId}`
    );

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(tokenId);
    expect(response.body.status).toBe('called');
    expect(response.body.counter_id).toBe(counterId);
  });

  test('Counter cannot call another token while occupied', async () => {
    const response = await authenticatedRequest(
      staffToken,
      'post',
      `/api/tokens/call/${counterId}`
    );

    expect(response.status).toBe(409);
    expect(response.body.error).toContain('active token');
  });

  test('Staff can recall a called token', async () => {
    const response = await authenticatedRequest(
      staffToken,
      'post',
      `/api/tokens/${tokenId}/recall`
    );

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('called');
  });

  test('Staff can start serving a token', async () => {
    const response = await authenticatedRequest(
      staffToken,
      'post',
      `/api/tokens/${tokenId}/serve`
    );

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('serving');
  });

  test('Staff can complete a token', async () => {
    const response = await authenticatedRequest(
      staffToken,
      'post',
      `/api/tokens/${tokenId}/complete`
    );

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('completed');
    expect(response.body.completed_at).toBeDefined();
  });

  test('Duplicate completion is rejected', async () => {
    const response = await authenticatedRequest(
      staffToken,
      'post',
      `/api/tokens/${tokenId}/complete`
    );

    expect(response.status).toBe(409);
    expect(response.body.error).toContain('already completed');
  });

  test('Staff can skip a waiting token', async () => {
    const response = await authenticatedRequest(
      staffToken,
      'post',
      `/api/tokens/${secondTokenId}/skip`
    );

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('skipped');
  });

  test('Invalid status transitions are rejected', async () => {
    const serveResponse = await authenticatedRequest(
      staffToken,
      'post',
      `/api/tokens/${tokenId}/serve`
    );

    expect(serveResponse.status).toBe(400);

    const recallResponse = await authenticatedRequest(
      staffToken,
      'post',
      `/api/tokens/${tokenId}/recall`
    );

    expect(recallResponse.status).toBe(400);
  });

  test('Customer cannot perform staff operations', async () => {
    const response = await authenticatedRequest(
      customerToken,
      'post',
      `/api/tokens/call/${counterId}`
    );

    expect(response.status).toBe(403);
  });

  test('Admin can perform staff operations', async () => {
    const service = createService(
      'Admin Operation Service',
      'ADM',
      5
    );

    const counter = createCounter(
      'Admin Operation Counter',
      service
    );

    const created = await createCustomerToken(
      customerToken,
      service
    );

    expect(created.status).toBe(201);

    const response = await authenticatedRequest(
      adminToken,
      'post',
      `/api/tokens/call/${counter}`
    );

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(created.body.id);
  });
});

// --------------------------------------------------
// Priority queue
// --------------------------------------------------

describe('Priority Queue Ordering', () => {
  let serviceId;
  let counterId;

  let normalTokenId;
  let highTokenId;
  let urgentTokenId;

  beforeAll(() => {
    serviceId = createService(
      'Priority Test',
      'PRI',
      5
    );

    counterId = createCounter(
      'Priority Counter',
      serviceId
    );
  });

  test('Higher priority tokens are called first', async () => {
    const normal = await createCustomerToken(
      customerToken,
      serviceId,
      0
    );

    const high = await createCustomerToken(
      customerToken,
      serviceId,
      1
    );

    const urgent = await createCustomerToken(
      customerToken,
      serviceId,
      2
    );

    expect(normal.status).toBe(201);
    expect(high.status).toBe(201);
    expect(urgent.status).toBe(201);

    normalTokenId = normal.body.id;
    highTokenId = high.body.id;
    urgentTokenId = urgent.body.id;

    const calledUrgent = await authenticatedRequest(
      staffToken,
      'post',
      `/api/tokens/call/${counterId}`
    );

    expect(calledUrgent.status).toBe(200);
    expect(calledUrgent.body.id).toBe(urgentTokenId);
    expect(calledUrgent.body.priority).toBe(2);

    await authenticatedRequest(
      staffToken,
      'post',
      `/api/tokens/${urgentTokenId}/complete`
    );

    const calledHigh = await authenticatedRequest(
      staffToken,
      'post',
      `/api/tokens/call/${counterId}`
    );

    expect(calledHigh.status).toBe(200);
    expect(calledHigh.body.id).toBe(highTokenId);
    expect(calledHigh.body.priority).toBe(1);

    await authenticatedRequest(
      staffToken,
      'post',
      `/api/tokens/${highTokenId}/complete`
    );

    const calledNormal = await authenticatedRequest(
      staffToken,
      'post',
      `/api/tokens/call/${counterId}`
    );

    expect(calledNormal.status).toBe(200);
    expect(calledNormal.body.id).toBe(normalTokenId);
    expect(calledNormal.body.priority).toBe(0);

    await authenticatedRequest(
      staffToken,
      'post',
      `/api/tokens/${normalTokenId}/complete`
    );
  });
});

// --------------------------------------------------
// Customer-specific display
// --------------------------------------------------

describe('Customer Display API', () => {
  let serviceId;
  let tokenId;

  beforeAll(() => {
    serviceId = createService(
      'Customer Display Service',
      'CDS',
      5
    );
  });

  test('Customer can retrieve their own service-specific display', async () => {
    const created = await createCustomerToken(
      customerToken,
      serviceId
    );

    expect(created.status).toBe(201);

    tokenId = created.body.id;

    const response = await authenticatedRequest(
      customerToken,
      'get',
      `/api/tokens/customer/display/${tokenId}`
    );

    expect(response.status).toBe(200);

    expect(response.body.service).toBeDefined();
    expect(response.body.service.id).toBe(serviceId);

    expect(response.body.currentTokens).toBeDefined();
    expect(response.body.upcomingTokens).toBeDefined();
    expect(response.body.ownToken).toBeDefined();
    expect(response.body.announcements).toBeDefined();
    expect(response.body.stats).toBeDefined();

    expect(response.body.ownToken.id).toBe(tokenId);
    expect(response.body.ownToken.status).toBe('waiting');

    // Other customers' account information must not be exposed.
    for (const item of response.body.upcomingTokens) {
      expect(item.user_id).toBeUndefined();
      expect(item.customer_name).toBeUndefined();
    }

    for (const item of response.body.currentTokens) {
      expect(item.user_id).toBeUndefined();
      expect(item.customer_name).toBeUndefined();
    }
  });

  test('Customer cannot access another customer display', async () => {
    const response = await authenticatedRequest(
      secondCustomerToken,
      'get',
      `/api/tokens/customer/display/${tokenId}`
    );

    expect(response.status).toBe(404);
  });

  test('Staff cannot use the customer-specific display endpoint', async () => {
    const response = await authenticatedRequest(
      staffToken,
      'get',
      `/api/tokens/customer/display/${tokenId}`
    );

    expect(response.status).toBe(403);
  });

  test('Customer display rejects invalid token IDs', async () => {
    const response = await authenticatedRequest(
      customerToken,
      'get',
      '/api/tokens/customer/display/invalid'
    );

    expect(response.status).toBe(400);
  });
});

// --------------------------------------------------
// Analytics API
// --------------------------------------------------

describe('Analytics API', () => {
  test('Staff can retrieve analytics', async () => {
    const response = await authenticatedRequest(
      staffToken,
      'get',
      '/api/analytics'
    );

    expect(response.status).toBe(200);
    expect(response.body.overview).toBeDefined();
    expect(response.body.overview.total_tokens).toBeGreaterThan(0);
    expect(response.body.overview.completed_tokens).toBeGreaterThan(0);
    expect(response.body.waitTime).toBeDefined();
    expect(response.body.serviceDuration).toBeDefined();
    expect(response.body.perService).toBeDefined();
    expect(Array.isArray(response.body.perService)).toBe(true);
  });

  test('Admin can retrieve analytics', async () => {
    const response = await authenticatedRequest(
      adminToken,
      'get',
      '/api/analytics'
    );

    expect(response.status).toBe(200);
    expect(response.body.overview).toBeDefined();
  });

  test('Customer cannot retrieve analytics', async () => {
    const response = await authenticatedRequest(
      customerToken,
      'get',
      '/api/analytics'
    );

    expect(response.status).toBe(403);
  });
});

// --------------------------------------------------
// All-service display API
// --------------------------------------------------

describe('Staff and Admin Display API', () => {
  test('Staff can retrieve all-service display data', async () => {
    const response = await authenticatedRequest(
      staffToken,
      'get',
      '/api/tokens/display'
    );

    expect(response.status).toBe(200);
    expect(response.body.currentTokens).toBeDefined();
    expect(response.body.upcomingTokens).toBeDefined();
    expect(response.body.announcements).toBeDefined();
    expect(response.body.stats).toBeDefined();
  });

  test('Admin can retrieve all-service display data', async () => {
    const response = await authenticatedRequest(
      adminToken,
      'get',
      '/api/tokens/display'
    );

    expect(response.status).toBe(200);
    expect(response.body.currentTokens).toBeDefined();
    expect(response.body.upcomingTokens).toBeDefined();
  });
});

// --------------------------------------------------
// Health check
// --------------------------------------------------

describe('Health Check', () => {
  test('GET /api/health should return ok', async () => {
    const response = await request(app)
      .get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });
});

// --------------------------------------------------
// Transaction safety
// --------------------------------------------------

describe('Transaction Safety', () => {
  test('Failed creation event must not leave an orphan token', async () => {
    const db = getDb();

    const serviceId = createService(
      'Create Rollback Test',
      'CRT',
      5
    );

    db.exec(`
      CREATE TRIGGER test_fail_created_event
      BEFORE INSERT ON token_events
      WHEN NEW.event_type = 'created'
      BEGIN
        SELECT RAISE(ABORT, 'Forced creation event failure');
      END;
    `);

    try {
      const response = await createCustomerToken(
        customerToken,
        serviceId
      );

      expect(response.status).toBe(500);

      const remaining = db.prepare(`
        SELECT COUNT(*) AS count
        FROM tokens
        WHERE service_id = ?
      `).get(serviceId);

      expect(Number(remaining.count)).toBe(0);
    } finally {
      db.exec(
        'DROP TRIGGER IF EXISTS test_fail_created_event'
      );
    }
  });

  test('Failed serving event must leave token called', async () => {
    const db = getDb();

    const serviceId = createService(
      'Serving Rollback Test',
      'SRT',
      5
    );

    const counterId = createCounter(
      'Serving Rollback Counter',
      serviceId
    );

    const created = await createCustomerToken(
      customerToken,
      serviceId
    );

    expect(created.status).toBe(201);

    const tokenId = created.body.id;

    const called = await authenticatedRequest(
      staffToken,
      'post',
      `/api/tokens/call/${counterId}`
    );

    expect(called.status).toBe(200);

    db.exec(`
      CREATE TRIGGER test_fail_serving_event
      BEFORE INSERT ON token_events
      WHEN NEW.event_type = 'serving'
      BEGIN
        SELECT RAISE(ABORT, 'Forced serving event failure');
      END;
    `);

    try {
      const response = await authenticatedRequest(
        staffToken,
        'post',
        `/api/tokens/${tokenId}/serve`
      );

      expect(response.status).toBe(500);

      const token = db.prepare(
        'SELECT status FROM tokens WHERE id = ?'
      ).get(tokenId);

      expect(token.status).toBe('called');
    } finally {
      db.exec(
        'DROP TRIGGER IF EXISTS test_fail_serving_event'
      );
    }
  });

  test('Failed skip event must preserve token status and counter', async () => {
    const db = getDb();

    const serviceId = createService(
      'Skip Rollback Test',
      'SKR',
      5
    );

    const counterId = createCounter(
      'Skip Rollback Counter',
      serviceId
    );

    const created = await createCustomerToken(
      customerToken,
      serviceId
    );

    expect(created.status).toBe(201);

    const tokenId = created.body.id;

    const called = await authenticatedRequest(
      staffToken,
      'post',
      `/api/tokens/call/${counterId}`
    );

    expect(called.status).toBe(200);

    db.exec(`
      CREATE TRIGGER test_fail_skipped_event
      BEFORE INSERT ON token_events
      WHEN NEW.event_type = 'skipped'
      BEGIN
        SELECT RAISE(ABORT, 'Forced skip event failure');
      END;
    `);

    try {
      const response = await authenticatedRequest(
        staffToken,
        'post',
        `/api/tokens/${tokenId}/skip`
      );

      expect(response.status).toBe(500);

      const token = db.prepare(`
        SELECT status, counter_id
        FROM tokens
        WHERE id = ?
      `).get(tokenId);

      expect(token.status).toBe('called');
      expect(token.counter_id).toBe(counterId);
    } finally {
      db.exec(
        'DROP TRIGGER IF EXISTS test_fail_skipped_event'
      );
    }
  });
});