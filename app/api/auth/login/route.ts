import { NextResponse } from 'next/server';
import { createSession, findUserByUsername, verifyPassword } from '@/lib/auth';

export async function POST(req: Request) {
  let body: { username?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  // Same message whether the user is missing or the password is wrong (no enumeration).
  const invalid = () => NextResponse.json({ error: '아이디 또는 비밀번호가 올바르지 않아요.' }, { status: 401 });

  if (!username || !password) return invalid();
  const found = findUserByUsername(username);
  if (!found) return invalid();
  if (!(await verifyPassword(password, found.password_hash))) return invalid();

  createSession(found.id);
  return NextResponse.json({ user: { id: found.id, username: found.username } });
}
