
require('dotenv').config({
  path: require('path').resolve(__dirname, '../.env'),
});

const readline = require('readline');
const bcrypt = require('bcryptjs');
const path = require('path');
const {
  getDb,
  closeDb,
} = require('../src/config/database');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

function askHidden(question) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      reject(new Error('Run this script in a normal terminal.'));
      return;
    }

    rl.pause();
    process.stdout.write(question);

    const stdin = process.stdin;
    let value = '';

    const cleanup = () => {
      stdin.removeListener('keypress', onKeypress);
      if (stdin.isTTY) stdin.setRawMode(false);
      process.stdout.write('\n');
    };

    const onKeypress = (character, key = {}) => {
      if (key.ctrl && key.name === 'c') {
        cleanup();
        reject(new Error('Cancelled.'));
        return;
      }

      if (key.name === 'return' || key.name === 'enter') {
        cleanup();
        resolve(value);
        return;
      }

      if (key.name === 'backspace') {
        value = value.slice(0, -1);
        return;
      }

      if (
        character &&
        !key.ctrl &&
        !key.meta &&
        character.length === 1
      ) {
        value += character;
      }
    };

    try {
      readline.emitKeypressEvents(stdin);
      stdin.setRawMode(true);
      stdin.on('keypress', onKeypress);
      stdin.resume();
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

async function main() {
  let db;

  try {
    console.log('\nQueueLess — Create Staff Account\n');

    const fullName = (await ask('Staff full name: ')).trim();
    const email = (await ask('Staff email: ')).trim().toLowerCase();
    const password = await askHidden('Staff password (hidden): ');
    const confirmPassword = await askHidden('Confirm password (hidden): ');

    if (fullName.length < 2 || fullName.length > 100) {
      throw new Error('Name must be between 2 and 100 characters.');
    }

    if (
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      throw new Error('Enter a valid email address.');
    }

    if (Buffer.byteLength(password, 'utf8') < 8 ||
        Buffer.byteLength(password, 'utf8') > 72) {
      throw new Error('Password must be between 8 and 72 bytes.');
    }

    if (password !== confirmPassword) {
      throw new Error('Passwords do not match.');
    }

    db = getDb();

    const existing = db.prepare(
      'SELECT id, role FROM users WHERE email = ?'
    ).get(email);

    if (existing) {
      throw new Error(
        `This email already exists with role "${existing.role}". ` +
        'Use a different email. No account was changed.'
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = db.prepare(`
      INSERT INTO users (
        full_name,
        email,
        password_hash,
        role,
        is_active
      )
      VALUES (?, ?, ?, 'staff', 1)
    `).run(fullName, email, passwordHash);

    console.log('\nStaff account created successfully.');
    console.log(`User ID: ${result.lastInsertRowid}`);
    console.log(`Name: ${fullName}`);
    console.log(`Email: ${email}`);
    console.log('Role: staff');
    console.log('Active: yes');
    console.log('\nYou can now sign in using this account.');
  } finally {
    rl.close();

    if (db) {
      closeDb();
    }
  }
}

main().catch((error) => {
  console.error(`\nCould not create staff account: ${error.message}`);
  process.exitCode = 1;
});
