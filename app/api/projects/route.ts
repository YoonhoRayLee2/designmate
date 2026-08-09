import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { listProjects } from '@/lib/projects';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = getSessionUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  return NextResponse.json({ projects: listProjects(user.id) });
}
