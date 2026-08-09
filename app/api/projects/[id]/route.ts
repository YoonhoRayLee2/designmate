import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { deleteProject, getProject, saveProject } from '@/lib/projects';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = getSessionUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  const project = getProject(user.id, params.id);
  if (!project) return NextResponse.json({ error: '프로젝트를 찾을 수 없어요.' }, { status: 404 });
  return NextResponse.json({ project });
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const user = getSessionUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });

  let body: { title?: unknown; turns?: unknown; updatedAt?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  const title = typeof body.title === 'string' ? body.title : '새 프로젝트';
  const turns = Array.isArray(body.turns) ? body.turns : [];
  const updatedAt = typeof body.updatedAt === 'number' ? body.updatedAt : Date.now();

  saveProject(user.id, params.id, title, turns, updatedAt);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = getSessionUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  const removed = deleteProject(user.id, params.id);
  if (!removed) return NextResponse.json({ error: '프로젝트를 찾을 수 없어요.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
