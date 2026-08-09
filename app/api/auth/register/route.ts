import { NextResponse } from 'next/server';
import { createSession, createUser, findUserByUsername, hashPassword } from '@/lib/auth';

const USERNAME_RE = /^[A-Za-z0-9._-]{3,40}$/;

export async function POST(req: Request) {
  let body: { username?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!USERNAME_RE.test(username)) {
    return NextResponse.json({ error: '아이디는 3~40자의 영문·숫자·._- 만 사용할 수 있어요.' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: '비밀번호는 8자 이상이어야 해요.' }, { status: 400 });
  }
  if (findUserByUsername(username)) {
    return NextResponse.json({ error: '이미 사용 중인 아이디예요.' }, { status: 409 });
  }

  const user = createUser(username, await hashPassword(password));
  createSession(user.id); // sign in immediately after registration
  return NextResponse.json({ user });
}
