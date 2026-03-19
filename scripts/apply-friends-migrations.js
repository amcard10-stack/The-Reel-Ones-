#!/usr/bin/env node
/**
 * Applies friends_feature_migration.sql and friends_message_read_migration.sql
 * using DB_HOST, DB_USER, DB_PASSWORD, DB_NAME from .env (same as server.js).
 *
 * Usage: npm run migrate:friends
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const ROOT = path.join(__dirname, '..');

function requireEnv(name) {
  const v = process.env[name];
  if (v === undefined || v === '') {
    console.error(`Missing or empty ${name} in .env (project root).`);
    process.exit(1);
  }
  return v;
}

async function main() {
  requireEnv('DB_HOST');
  requireEnv('DB_USER');
  requireEnv('DB_NAME');

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME,
    multipleStatements: true,
  });

  console.log('Running friends_feature_migration.sql …');
  const sql1 = fs.readFileSync(path.join(ROOT, 'friends_feature_migration.sql'), 'utf8');
  await conn.query(sql1);
  console.log('  Done.');

  console.log('Running friends_message_read_migration.sql …');
  const sql2 = fs.readFileSync(path.join(ROOT, 'friends_message_read_migration.sql'), 'utf8');
  try {
    await conn.query(sql2);
    console.log('  Done.');
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME' || Number(e.errno) === 1060) {
      console.log('  read_at already exists — skipped.');
    } else {
      throw e;
    }
  }

  await conn.end();
  console.log('Friends DB migrations finished.');
}

main().catch((err) => {
  console.error('Migration failed:', err.message || err);
  process.exit(1);
});
