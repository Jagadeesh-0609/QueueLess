
/**
 * QueueLess - Secure Admin Account Creation
 *
 * Run with: npm run admin:create
 *
 * Creates an Admin account without exposing a public registration endpoint.
 * Existing accounts are never promoted or overwritten.
 */

require('dotenv').config();

const bcrypt = require('bcryptjs');
const readline = require('readline');
const {
  getDb,
  initializeSchema,
  closeDb,
} = require('./database');

const SALT_ROUNDS = 12;
const MIN_PASSWORD_BYTES = 8;
const MAX_PASSWORD_BYTES = 72;

function askQuestion(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

function askHiddenPassword() {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    if (!stdin.isTTY || !stdout.isTTY) {
      reject(
        new Error('Run this script in an interactive terminal.')
      );
      return;
    }

    let password = '';
    let completed = false;

    function cleanup() {
      stdin.removeListener('keypress', handleKeypress);

      if (stdin.isTTY) {
        stdin.setRawMode(false);
      }

      stdin.pause();
    }

    function finish(error) {
      if (completed) return;

      completed = true;
      cleanup();
      stdout.write('\n');

      if (error) {
        reject(error);
      } else {
        resolve(password);
      }
    }

    function handleKeypress(character, key = {}) {
      if (key.ctrl && (key.name === 'c' || key.name === 'd')) {
        finish(new Error('Admin creation cancelled.'));
        return;
      }

      if (key.name === 'return') {
        finish();
        return;
      }

      if (key.name === 'backspace') {
        password = password.slice(0, -1);
        return;
      }

      if (
        character &&
        !key.ctrl &&
        !key.meta &&
        character.length === 1
      ) {
        password += character;
      }
    }

    try {
      stdout.write('Admin password (hidden): ');

      readline.emitKeypressEvents(stdin);
      stdin.setRawMode(true);
      stdin.resume();
      stdin.on('keypress', handleKeypress);
    } catch (error) {
      finish(
        new Error('Unable to securely read the password.')
      );
    }
  });
}

async function createAdmin() {
  let rl;

  try {
    console.log('\n================================');
    console.log('   QUEUELESS ADMIN SETUP');
    console.log('================================\n');

    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const fullName = await askQuestion(
      rl,
      'Admin full name: '
    );

    const email = (
      await askQuestion(rl, 'Admin email address: ')
    ).toLowerCase();

    rl.close();
    rl = null;

    if (fullName.length < 2 || fullName.length > 100) {
      throw new Error(
        'Name must be between 2 and 100 characters.'
      );
    }

    if (
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      throw new Error('Please enter a valid email address.');
    }

    const password = await askHiddenPassword();
    const passwordBytes = Buffer.byteLength(password, 'utf8');

    if (
      passwordBytes < MIN_PASSWORD_BYTES ||
      passwordBytes > MAX_PASSWORD_BYTES
    ) {
      throw new Error(
        'Password must be between 8 and 72 bytes.'
      );
    }

    // Initialize the existing schema without deleting application data.
    const db = initializeSchema(getDb());

    const existingUser = db.prepare(`
      SELECT id, email, role, is_active
      FROM users
      WHERE email = ?
    `).get(email);

    if (existingUser) {
      if (existingUser.role === 'admin') {
        throw new Error(
          'An Admin account with this email already exists. ' +
          'No changes were made.'
        );
      }

      throw new Error(
        `This email already belongs to a ${existingUser.role} account. ` +
        'Use a different email address. No account was modified.'
      );
    }

    const passwordHash = await bcrypt.hash(
      password,
      SALT_ROUNDS
    );

    const result = db.prepare(`
      INSERT INTO users (
        full_name,
        email,
        password_hash,
        role,
        is_active
      )
      VALUES (?, ?, ?, 'admin', 1)
    `).run(fullName, email, passwordHash);

    console.log('\n================================');
    console.log('   ADMIN ACCOUNT CREATED');
    console.log('================================');
    console.log(`Name: ${fullName}`);
    console.log(`Email: ${email}`);
    console.log('Role: admin');
    console.log('Status: Active');
    console.log(`Database User ID: ${result.lastInsertRowid}`);
    console.log('\nYou can now log in through the QueueLess login page.');
    console.log('Your password has not been displayed or stored in plain text.');
  } finally {
    if (rl) {
      rl.close();
    }

    try {
      closeDb();
    } catch (error) {
      console.error(
        'Warning: Could not close the database connection:',
        error.message
      );
    }
  }
}

createAdmin().catch((error) => {
  console.error('\nAdmin creation failed:', error.message);
  process.exitCode = 1;
});
