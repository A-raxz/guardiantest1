import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA = fs.readFileSync(path.join(here, 'schema.sql'), 'utf8');

let db;

/**
 * The single connection used by the API.
 *
 * SQLite keeps the project dependency-free and is plenty for a few thousand
 * users. Every query in the codebase goes through this module, so swapping in
 * Postgres later means reimplementing this file and nothing else.
 */
export function getDb() {
  if (!db) db = openDatabase(config.databaseFile);
  return db;
}

export function openDatabase(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const connection = new DatabaseSync(file);
  connection.exec(SCHEMA);
  return connection;
}

/** Test helper: point the module at a throwaway in-memory database. */
export function useDatabase(connection) {
  db = connection;
  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = undefined;
  }
}

/** Run `fn` inside a transaction, rolling back if it throws. */
export function transaction(fn) {
  const connection = getDb();
  connection.exec('BEGIN');
  try {
    const result = fn();
    connection.exec('COMMIT');
    return result;
  } catch (error) {
    connection.exec('ROLLBACK');
    throw error;
  }
}
