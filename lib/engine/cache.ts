import type { EngineOutput, GenerateRequest } from './types';

// 동일 요청 메모리 캐시(LRU). 완전히 같은 입력(대화 전체 + currentSpec)이면
// LLM을 재호출하지 않고 직전 결과를 즉시 돌려준다. 서버 프로세스 메모리에만 존재하며
// 재시작(콜드스타트) 시 초기화된다. 서버 DB 없이 동작하는 저위험 최적화.
//
// 캐시 대상은 완결된 산출물(mode:'design')만. 되묻기(questions)는 대화 흐름상
// 매번 새로 판단하는 편이 안전하므로 캐시하지 않는다.

const MAX_ENTRIES = 50;

// Map은 삽입 순서를 보존하므로 이를 LRU로 활용한다(가장 오래된 = 첫 키).
const store = new Map<string, EngineOutput>();

/** 요청을 안정적인 캐시 키로 직렬화한다. 메시지 순서·내용·이미지·currentSpec 포함. */
export function cacheKey(req: GenerateRequest): string {
  const messages = req.messages.map((m) => ({
    role: m.role,
    content: m.content,
    images: m.images ?? [],
  }));
  return JSON.stringify({ messages, currentSpec: req.currentSpec ?? null, currentHtml: req.currentHtml ?? null });
}

export function getCached(key: string): EngineOutput | undefined {
  const hit = store.get(key);
  if (hit === undefined) return undefined;
  // 접근된 항목을 최신으로: 삭제 후 재삽입해 LRU 순서 갱신.
  store.delete(key);
  store.set(key, hit);
  return hit;
}

export function setCached(key: string, value: EngineOutput): void {
  if (value.mode !== 'design') return; // 되묻기는 캐시하지 않음
  if (store.has(key)) store.delete(key);
  store.set(key, value);
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}
