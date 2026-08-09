import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { db } from './db';

// Self-hosted ID/PW auth with zero dependencies (Node built-in crypto).
// Passwords: scrypt (memory-hard KDF). Sessions: opaque random token stored in
// the DB + httpOnly cookie — logout is a row delete, no JWT/blocklist needed.

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 64;
const SESSION_COOKIE = 'dm_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface User {
  id: string;
  username: string;
}

function id(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(6).toString('hex')}`;
}

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

/** Produce a self-describing hash: scrypt$N$r$p$salt_b64$hash_b64 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, expected.length, { N: Number(n), r: Number(r), p: Number(p) }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// --- Users ---

export function findUserByUsername(
  username: string,
): { id: string; username: string; password_hash: string } | undefined {
  return db.prepare('SELECT id, username, password_hash FROM users WHERE username = ?').get(username) as
    { id: string; username: string; password_hash: string } | undefined;
}

export function createUser(username: string, passwordHash: string): User {
  const userId = id('u');
  db.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)').run(
    userId,
    username,
    passwordHash,
    Date.now(),
  );
  return { id: userId, username };
}

// --- Sessions ---

/** Create a session row and set the httpOnly cookie. */
export function createSession(userId: string): void {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expiresAt);
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

/** Delete the current session (if any) and clear the cookie. */
export function destroySession(): void {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  cookies().delete(SESSION_COOKIE);
}

/** Resolve the logged-in user from the session cookie, or null. Lazily deletes expired sessions. */
export function getSessionUser(): User | null {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.id AS id, u.username AS username, s.expires_at AS expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`,
    )
    .get(token) as { id: string; username: string; expires_at: number } | undefined;
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return { id: row.id, username: row.username };
}
