import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

// SQLite via Node's built-in driver (no dependency). Single connection reused
// across requests; cached on globalThis so Next.js dev HMR doesn't open many
// handles (same server-memory singleton pattern as lib/engine/cache.ts).
//
// File location is env-controlled so a Render Persistent Disk can be mounted
// later without code changes (DATABASE_PATH → mount path). The free tier's disk
// is ephemeral, so on that plan data resets on redeploy (acceptable for alpha).

const DB_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), 'data', 'designmate.db');

function openDb(): DatabaseSync {
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;'); // wait instead of erroring on brief lock contention
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at    INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS projects (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title      TEXT NOT NULL,
      turns_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  `);
  return db;
}

const globalForDb = globalThis as unknown as { __designmateDb?: DatabaseSync };

export const db: DatabaseSync = globalForDb.__designmateDb ?? openDb();
if (!globalForDb.__designmateDb) globalForDb.__designmateDb = db;
