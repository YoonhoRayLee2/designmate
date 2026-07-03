import { NextResponse } from 'next/server';
import { getEngine } from '@/lib/engine';
import type { ChatMessage, DesignSpec } from '@/lib/engine/types';

export async function POST(req: Request) {
  let body: { messages?: unknown; currentSpec?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  const messages: ChatMessage[] = Array.isArray(body.messages)
    ? body.messages
        .filter(
          (m): m is ChatMessage =>
            m &&
            (m.role === 'user' || m.role === 'assistant') &&
            typeof m.content === 'string',
        )
        .map((m) => ({
          role: m.role,
          content: m.content,
          ...(Array.isArray(m.images)
            ? { images: m.images.filter((s): s is string => typeof s === 'string' && s.startsWith('data:image')) }
            : {}),
        }))
    : [];

  if (!messages.some((m) => m.role === 'user' && m.content.trim())) {
    return NextResponse.json({ error: '요구사항을 입력해 주세요.' }, { status: 400 });
  }

  const currentSpec =
    body.currentSpec && typeof body.currentSpec === 'object'
      ? (body.currentSpec as DesignSpec)
      : undefined;

  try {
    const result = await getEngine().generate({ messages, currentSpec });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : '생성 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
