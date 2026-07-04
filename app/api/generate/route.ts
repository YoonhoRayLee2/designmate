import { NextResponse } from 'next/server';
import { getEngine } from '@/lib/engine';
import { EngineError } from '@/lib/engine/groqEngine';
import type { ChatMessage, DesignSpec } from '@/lib/engine/types';

const MAX_IMAGES = 5;
// Groq base64 image limit is ~4MB; base64 inflates ~33%, so cap the data-URL length.
const MAX_IMAGE_CHARS = Math.ceil((4 * 1024 * 1024 * 4) / 3);
const ALLOWED_IMAGE = /^data:image\/(png|jpe?g|webp|gif);base64,/i;
const MAX_CONTENT_CHARS = 8000;

function sanitizeImages(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is string => typeof s === 'string' && ALLOWED_IMAGE.test(s) && s.length <= MAX_IMAGE_CHARS)
    .slice(0, MAX_IMAGES);
}

/** Accept a currentSpec only if it has the shape we rely on; otherwise ignore it. */
function sanitizeSpec(raw: unknown): DesignSpec | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const s = raw as Record<string, unknown>;
  if (typeof s.title !== 'string' || typeof s.screenType !== 'string') return undefined;
  return raw as DesignSpec;
}

export async function POST(req: Request) {
  let body: { messages?: unknown; currentSpec?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  // Reject oversized images explicitly so the user gets a clear message.
  if (Array.isArray(body.messages)) {
    for (const m of body.messages) {
      if (m && Array.isArray(m.images)) {
        for (const img of m.images) {
          if (typeof img === 'string' && img.startsWith('data:') && !ALLOWED_IMAGE.test(img)) {
            return NextResponse.json({ error: '지원하지 않는 이미지 형식입니다. (PNG/JPG/WEBP/GIF만 가능)' }, { status: 400 });
          }
          if (typeof img === 'string' && img.length > MAX_IMAGE_CHARS) {
            return NextResponse.json({ error: '이미지가 너무 큽니다. 4MB 이하로 첨부해 주세요.' }, { status: 400 });
          }
        }
      }
    }
  }

  const messages: ChatMessage[] = Array.isArray(body.messages)
    ? body.messages
        .filter(
          (m): m is ChatMessage =>
            m &&
            (m.role === 'user' || m.role === 'assistant') &&
            typeof m.content === 'string',
        )
        .map((m) => {
          const images = sanitizeImages(m.images);
          return {
            role: m.role,
            content: m.content.slice(0, MAX_CONTENT_CHARS),
            ...(images.length ? { images } : {}),
          };
        })
    : [];

  if (!messages.some((m) => m.role === 'user' && m.content.trim())) {
    return NextResponse.json({ error: '요구사항을 입력해 주세요.' }, { status: 400 });
  }

  const currentSpec = sanitizeSpec(body.currentSpec);

  try {
    const result = await getEngine().generate({ messages, currentSpec });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof EngineError) {
      // userMessage is safe to expose; full detail is already logged in the engine.
      return NextResponse.json({ error: e.userMessage }, { status: 502 });
    }
    console.error('[api/generate] unexpected error', e);
    return NextResponse.json({ error: '화면 생성 중 오류가 발생했습니다. 다시 시도해 주세요.' }, { status: 502 });
  }
}
