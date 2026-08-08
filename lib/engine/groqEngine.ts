import type {
  ChatMessage,
  ClarifyingQuestion,
  DataField,
  DesignEngine,
  DesignSpec,
  EngineOutput,
  GenerateRequest,
  PermissionRow,
  ScreenType,
  StreamEvent,
} from './types';
import { renderSpecMarkdown } from '../spec';
import { colorGuideLine, stylingGuideLine } from '../designTokens';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
// HTML author: larger model produces markedly better UI. Text-only.
const HTML_MODEL = process.env.GROQ_HTML_MODEL || 'openai/gpt-oss-120b';
// Vision: analyzes reference images only (planner/HTML use the text model, which
// gives reliable JSON — qwen's <think> blocks break json_object mode).
// llama-4-scout was retired from Groq; qwen3.6-27b is the current vision model.
const VISION_MODEL = process.env.GROQ_VISION_MODEL || 'qwen/qwen3.6-27b';
// Free-tier TPM cap is 8000 (prompt + max_tokens counted together);
// leave headroom for the system prompt, spec, and conversation history.
const MAX_TOKENS = 5500;
// A4 (재현성): a fixed seed makes the same input yield a similar result across
// calls. Best-effort — the provider may not honor it strictly, but it reduces
// run-to-run drift for the same prompt/spec.
const SEED = 42;

const SCREEN_TYPES: ScreenType[] = ['list', 'detail', 'form', 'dashboard', 'auth', 'approval', 'wizard', 'report'];

const NH_CONTEXT = `[맥락] 이것은 일반 소비자 앱이 아니라 NH농협(은행/축산·농업 협동조합)의 사내·업무용 시스템 화면이다.
- 사용자: 주로 영업점 직원, 본부 담당자, 관리자 등 내부 사용자. (조합원 대상 화면을 명시하면 그에 맞춘다)
- 용어: 농협 도메인 용어를 자연스럽게 사용 — 조합원, 영업점/지점, 본부, 여신/수신, 대출, 예적금, 승인/결재, 상담 이력, 조회/등록/처리 등.
- 성격: 정보 밀도가 높고 정확·신뢰가 중요한 업무 화면. 명료함과 데이터 가독성을 우선한다.`;

// --- Call A: planner. Decides questions-vs-design and produces the (small) spec as JSON. ---
const PLANNER_PROMPT = `당신은 NH농협 사내 화면 설계를 돕는 시니어 프로덕트 디자이너다. 사용자의 요구사항(및 첨부 이미지)을 분석해, 되물을지 / 설계할지 판단한다.

${NH_CONTEXT}

[되묻기 규칙]
핵심 정보(사용 주체, 주요 목적, 필수 항목/데이터, 화면 유형)가 빠져 있고 추측하면 결과가 크게 달라질 때만 되묻는다.
- 되물을 때는 mode="questions", 2~4개 객관식 질문(각 보기 2~4개).
- 이미 명확하거나 합리적 기본값이 있으면 묻지 말고 mode="design".
- 사용자가 이전 턴에 이미 답한 것은 다시 묻지 않는다.
- 각 질문에 multiSelect(불리언)를 지정한다. 여러 개를 동시에 고르는 게 자연스러운 질문(예: "포함할 항목을 모두 고르세요", "필요한 기능")은 true, 하나만 골라야 하는 질문(예: 화면 유형·사용 주체 택1)은 false.

반드시 아래 JSON 하나만 출력한다. 코드펜스·설명 금지.

(A) 되물을 때:
{ "mode":"questions", "questions":[ { "question":"...", "options":["...","..."], "multiSelect":false } ] }

(B) 설계할 때 (spec만, HTML은 넣지 않는다):
{
  "mode":"design",
  "spec":{
    "title":"화면 제목 (24자 이내)",
    "screenType":"list | detail | form | dashboard | auth | approval | wizard | report 중 하나",
    "domain":"도메인 (예: 여신, 수신, 조합원관리, 일반 등)",
    "summary":"이 화면이 무엇을 하는지 1~2문장",
    "screens":[{ "name":"화면명","purpose":"목적","components":["요소1","요소2"] }],
    "components":[{ "name":"컴포넌트명","description":"설명","states":["기본","오류"] }],
    "userFlow":["단계1","단계2"],
    "designNotes":["유의점 (레퍼런스 이미지가 있으면 무엇을 참고할지 한 줄 포함)"],
    "dataFields":[{ "name":"필드명","type":"타입(문자열/숫자/날짜/코드 등)","required":true,"rule":"검증규칙/자릿수","masking":"마스킹 규칙(있으면)" }],
    "permissions":[{ "role":"역할(예: 영업점 직원, 지점장, 본부 담당자)","actions":"허용 액션(예: 조회/등록, 승인)" }],
    "exceptions":["예외·오류 케이스(예: 권한 없음, 잔액 부족, 중복 신청)"],
    "integrations":["연계 시스템(예: 여신원장 API, 신용평가 전문)"],
    "nonFunctional":["비기능 요구(예: 조회 3초 내, 개인정보 접근 감사로그)"]
  }
}

(C) 국소 수정할 때 (이미 만든 화면이 있고, 사용자가 그 화면의 일부만 고쳐달라고 할 때):
{ "mode":"edit" }
- 예: "이 버튼 빨간색으로", "잔액 컬럼 지워", "제목을 XX로 바꿔", "행 하나 더 추가" 등 **기존 화면의 부분 변경** 요청.
- 화면 유형·목적 자체가 바뀌는 큰 변경이거나 새 화면 요청이면 edit가 아니라 design.
- 현재 화면이 없으면 절대 edit를 쓰지 않는다.

[screenType 판단 가이드]
- approval: 승인/결재/반려 등 결재선·처리 액션이 핵심인 화면
- wizard: 여러 단계를 순차 진행하는 신청/등록(단계 표시기 있음)
- report: 조회 조건 → 표/집계 결과 출력·인쇄·다운로드가 핵심인 화면
- 위에 해당 없으면 기존 list/detail/form/dashboard/auth 중 선택

[dataFields~nonFunctional 규칙] 모두 선택 항목이다. 이 사내 업무 화면에서 실제로 의미 있는 것만 채우고, 해당 없으면 필드를 아예 빼거나 빈 배열로 둔다. 억지로 지어내지 않는다. 입력 폼/조회 화면이면 dataFields는 되도록 채운다.`;

// --- Call B: HTML author. Plain-text output (NOT JSON) so large HTML isn't truncated. ---
const HTML_STYLE_GUIDE = `너는 NH농협 사내 시스템 프론트엔드 개발자다. 주어진 설계(SPEC)와 요구사항을 바탕으로 실제 서비스 수준의 고충실도 화면 HTML을 만든다.

출력 규칙:
- <!DOCTYPE html> 로 시작하는 완전한 standalone HTML 문서 하나만 출력한다. 코드펜스(\`\`\`)·설명 문장 금지.
- 모든 CSS는 <head>의 <style>에 인라인. <script> 금지(정적 목업).

${NH_CONTEXT}

디자인:
- ${colorGuideLine()}
- ${stylingGuideLine()}
- 회색 플레이스홀더·점선 와이어프레임 톤 금지. 그럴듯한 예시 값(한국식 이름·금액·날짜·계좌번호 등)을 채운다.
- list/dashboard는 테이블·카드 그리드로 정보 밀도 있게. 폼은 라벨-입력 정렬 깔끔하게.
- 요구/레퍼런스의 구체 요소(필드·컬럼·섹션·버튼)를 실제 반영. 일반 껍데기 금지.
- 레이아웃 폭: 대시보드/목록은 최대 1100px 중앙 정렬, 단순 조회/폼은 640~800px.
- 반드시 반응형: @media (max-width:768px)에서 다단→1단, 테이블은 overflow-x:auto 또는 카드형 전환, 여백·글자 조정. 터치 타깃 최소 44px.
- 한국어 라벨. 아이콘은 이모지/유니코드/인라인 SVG.

[접근성 — KWCAG/WCAG AA 준수. 사내 서비스 필수]
- 시맨틱 마크업: header/nav/main/section/table(+thead/th scope)/form/label 을 실제 역할대로 사용. div 남발 금지.
- 모든 폼 입력에 <label for>(또는 감싼 label) 연결. 아이콘 버튼엔 aria-label. 표에는 <caption> 또는 aria-label.
- 이미지/일러스트 <img>엔 alt. 순수 장식은 alt="" 또는 aria-hidden. 정보 전달용 이모지 아이콘엔 텍스트 라벨 병기(색·모양만으로 의미 전달 금지).
- 명도 대비: 본문 텍스트 대비 최소 4.5:1. 옅은 회색 위 옅은 회색 텍스트 금지.
- 상태를 색으로만 나타내지 말고 텍스트/아이콘을 함께(예: 승인 ✓, 반려 ✕).
- 논리적 heading 위계(h1→h2→h3), 폼 오류는 텍스트로 명시.

[레퍼런스 이미지가 첨부된 경우] 레이아웃 구조·컴포넌트 배치·정보 위계·여백 감각을 참고하되, NH 브랜드 톤과 사내 맥락에 맞게 재해석한다. 그대로 베끼지 말 것.`;

// --- Call B': HTML editor. Minimally edits existing HTML for a localized change. ---
const HTML_EDIT_GUIDE = `너는 NH농협 사내 시스템 프론트엔드 개발자다. 이미 완성된 화면 HTML이 주어진다. 사용자의 수정 요청을 반영하되, **요청과 무관한 부분은 한 글자도 바꾸지 마라.**

절대 규칙:
- 전체 HTML 문서를 다시 출력한다(<!DOCTYPE html>부터 </html>까지). 단, 요청한 변경만 반영하고 나머지 구조·텍스트·스타일·값은 원본 그대로 유지한다.
- 새로 화면을 그리지 마라. 리팩터링·재배치·톤 변경 금지. 요청한 최소 변경만.
- 코드펜스(\`\`\`)·설명 문장 금지. HTML 문서 하나만.
- 접근성·시맨틱 마크업은 유지한다(라벨·alt·scope 등 제거 금지).`;

interface PlannerPayload {
  mode?: 'questions' | 'design' | 'edit';
  questions?: unknown;
  spec?: Partial<DesignSpec>;
}

function coerceQuestions(raw: unknown): ClarifyingQuestion[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((q): ClarifyingQuestion | null => {
      if (!q || typeof q.question !== 'string') return null;
      const options = Array.isArray(q.options)
        ? q.options.filter((o: unknown): o is string => typeof o === 'string')
        : [];
      if (options.length < 2) return null;
      return { question: q.question, options: options.slice(0, 4), multiSelect: q.multiSelect === true };
    })
    .filter((q): q is ClarifyingQuestion => q !== null)
    .slice(0, 4);
}

/** Keep only string entries of an array; drop everything else. */
function coerceStringList(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((s): s is string => typeof s === 'string' && s.trim() !== '') : [];
}

function coerceDataFields(raw: unknown): DataField[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((f): DataField | null => {
      if (!f || typeof f.name !== 'string') return null;
      return {
        name: f.name,
        type: typeof f.type === 'string' ? f.type : '-',
        required: f.required === true,
        rule: typeof f.rule === 'string' ? f.rule : undefined,
        masking: typeof f.masking === 'string' ? f.masking : undefined,
      };
    })
    .filter((f): f is DataField => f !== null);
}

function coercePermissions(raw: unknown): PermissionRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p): PermissionRow | null =>
      p && typeof p.role === 'string' && typeof p.actions === 'string' ? { role: p.role, actions: p.actions } : null,
    )
    .filter((p): p is PermissionRow => p !== null);
}

/** Attach an optional field only when the coerced list is non-empty. */
function optional<T>(list: T[]): T[] | undefined {
  return list.length ? list : undefined;
}

function coerceSpec(raw: Partial<DesignSpec>, prompt: string): DesignSpec {
  const screenType = SCREEN_TYPES.includes(raw.screenType as ScreenType) ? (raw.screenType as ScreenType) : 'list';
  return {
    title: raw.title?.trim() || prompt.slice(0, 24),
    screenType,
    domain: raw.domain?.trim() || '일반',
    summary: raw.summary?.trim() || '',
    screens: Array.isArray(raw.screens) ? raw.screens : [],
    components: Array.isArray(raw.components) ? raw.components : [],
    userFlow: Array.isArray(raw.userFlow) ? raw.userFlow : [],
    designNotes: Array.isArray(raw.designNotes) ? raw.designNotes : [],
    dataFields: optional(coerceDataFields(raw.dataFields)),
    permissions: optional(coercePermissions(raw.permissions)),
    exceptions: optional(coerceStringList(raw.exceptions)),
    integrations: optional(coerceStringList(raw.integrations)),
    nonFunctional: optional(coerceStringList(raw.nonFunctional)),
  };
}

/** Convert a ChatMessage to Groq API content, inlining images as multimodal parts. */
function toApiMessage(m: ChatMessage) {
  if (m.role === 'user' && m.images && m.images.length) {
    return {
      role: m.role,
      content: [
        { type: 'text', text: m.content },
        ...m.images.slice(0, 5).map((url) => ({ type: 'image_url', image_url: { url } })),
      ],
    };
  }
  return { role: m.role, content: m.content };
}

/** Remove a leading <think>…</think> reasoning block (qwen emits these). */
function stripThink(s: string): string {
  return s.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

/** Strip an accidental ```html ... ``` code fence the model sometimes adds. */
function stripFence(s: string): string {
  const t = stripThink(s).trim();
  const fence = t.match(/^```(?:html)?\s*([\s\S]*?)\s*```$/i);
  return (fence ? fence[1] : t).trim();
}

const REQUEST_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 2;

/** Error carrying a user-facing Korean message; raw details stay in server logs. */
export class EngineError extends Error {
  constructor(
    public userMessage: string,
    logDetail?: string,
  ) {
    super(logDetail || userMessage);
    this.name = 'EngineError';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Map an HTTP status to a user-facing message. */
function statusMessage(status: number): string {
  if (status === 401 || status === 403) return 'API 키가 유효하지 않습니다. 서버 설정을 확인해 주세요.';
  if (status === 413) return '요청이 너무 큽니다. 입력이나 첨부 이미지를 줄여 주세요.';
  if (status === 429) return '요청이 몰려 잠시 제한되었습니다. 잠시 후 다시 시도해 주세요.';
  if (status >= 500) return 'AI 서비스가 일시적으로 불안정합니다. 잠시 후 다시 시도해 주세요.';
  return '화면 생성 중 오류가 발생했습니다.';
}

/**
 * Call Groq with a timeout and bounded retries. Retries 429/5xx (honoring
 * Retry-After when present); 4xx other than 429 fail immediately.
 * `label` is used only for server-side logging.
 */
async function callGroq(
  apiKey: string,
  body: { model: string; [key: string]: unknown },
  label: string,
): Promise<string> {
  let lastErr: EngineError | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const started = Date.now();
    try {
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const detail = (await res.text().catch(() => '')).slice(0, 300);
        const retriable = res.status === 429 || res.status >= 500;
        console.error(
          `[groq] ${label} model=${body.model} status=${res.status} attempt=${attempt} ${Date.now() - started}ms ${detail}`,
        );
        lastErr = new EngineError(statusMessage(res.status), `${res.status} ${detail}`);
        if (retriable && attempt < MAX_RETRIES) {
          const retryAfter = Number(res.headers.get('retry-after'));
          const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1500 * (attempt + 1);
          await sleep(wait);
          continue;
        }
        throw lastErr;
      }

      const data = await res.json();
      console.info(`[groq] ${label} model=${body.model} ok attempt=${attempt} ${Date.now() - started}ms`);
      return data?.choices?.[0]?.message?.content ?? '';
    } catch (e) {
      if (e instanceof EngineError) throw e;
      const aborted = e instanceof Error && e.name === 'AbortError';
      console.error(
        `[groq] ${label} model=${body.model} ${aborted ? 'timeout' : 'network-error'} attempt=${attempt}`,
        e,
      );
      lastErr = new EngineError(
        aborted ? '응답이 지연되어 중단했습니다. 잠시 후 다시 시도해 주세요.' : 'AI 서비스에 연결하지 못했습니다.',
        e instanceof Error ? e.message : String(e),
      );
      if (attempt < MAX_RETRIES) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      throw lastErr;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr ?? new EngineError('화면 생성 중 오류가 발생했습니다.');
}

/**
 * Streaming variant of callGroq: yields content deltas as the model produces them.
 * Retries 429/5xx before the stream starts (bounded); once bytes flow, a failure
 * mid-stream ends the generator (the caller keeps whatever arrived). Text-only use.
 */
async function* callGroqStream(
  apiKey: string,
  body: { model: string; [key: string]: unknown },
  label: string,
): AsyncGenerator<string> {
  let lastErr: EngineError | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const started = Date.now();
    try {
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, stream: true }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const detail = (await res.text().catch(() => '')).slice(0, 300);
        const retriable = res.status === 429 || res.status >= 500;
        console.error(
          `[groq] ${label} model=${body.model} status=${res.status} attempt=${attempt} ${Date.now() - started}ms ${detail}`,
        );
        lastErr = new EngineError(statusMessage(res.status), `${res.status} ${detail}`);
        if (retriable && attempt < MAX_RETRIES) {
          const retryAfter = Number(res.headers.get('retry-after'));
          const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1500 * (attempt + 1);
          clearTimeout(timer);
          await sleep(wait);
          continue;
        }
        clearTimeout(timer);
        throw lastErr;
      }

      // Parse the SSE stream: lines of `data: {json}` with a final `data: [DONE]`.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? ''; // keep the trailing partial line
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            const chunk = JSON.parse(payload);
            const delta = chunk?.choices?.[0]?.delta?.content;
            if (typeof delta === 'string' && delta) yield delta;
          } catch {
            /* ignore keep-alive / non-JSON lines */
          }
        }
      }
      console.info(`[groq] ${label} model=${body.model} stream-ok attempt=${attempt} ${Date.now() - started}ms`);
      return;
    } catch (e) {
      if (e instanceof EngineError) throw e;
      const aborted = e instanceof Error && e.name === 'AbortError';
      console.error(
        `[groq] ${label} model=${body.model} ${aborted ? 'timeout' : 'network-error'} attempt=${attempt}`,
        e,
      );
      lastErr = new EngineError(
        aborted ? '응답이 지연되어 중단했습니다. 잠시 후 다시 시도해 주세요.' : 'AI 서비스에 연결하지 못했습니다.',
        e instanceof Error ? e.message : String(e),
      );
      if (attempt < MAX_RETRIES) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      throw lastErr;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr ?? new EngineError('화면 생성 중 오류가 발생했습니다.');
}

/** Ask the vision model to describe reference images as text (for the text-only HTML model). */
async function describeReferences(apiKey: string, message: ChatMessage): Promise<string> {
  const raw = await callGroq(
    apiKey,
    {
      model: VISION_MODEL,
      temperature: 0.3,
      max_tokens: 1600, // headroom for qwen's <think> block
      messages: [
        {
          role: 'system',
          content:
            '첨부된 레퍼런스 UI 이미지를 분석해, 레이아웃 구조·주요 컴포넌트 배치·정보 위계·색/여백 감각을 한국어로 간결히 서술한다. HTML을 만들지 말고 설명만.',
        },
        toApiMessage(message),
      ],
    },
    'vision',
  );
  return stripThink(raw);
}

/** Body for the HTML-author call, shared by streaming and non-streaming paths. */
function htmlAuthorBody(
  req: GenerateRequest,
  spec: DesignSpec,
  textMessages: { role: string; content: string }[],
  referenceNote: string,
) {
  const htmlSystem = req.currentSpec
    ? `${HTML_STYLE_GUIDE}\n\n[직전 화면 HTML을 최신 지시대로 수정하되, 무관한 부분은 유지한다.]`
    : HTML_STYLE_GUIDE;
  return {
    model: HTML_MODEL,
    temperature: 0.5,
    seed: SEED,
    max_tokens: MAX_TOKENS,
    messages: [
      { role: 'system', content: htmlSystem },
      ...textMessages,
      {
        role: 'user',
        content: `위 요구사항과 아래 SPEC을 반영한 완전한 HTML 문서를 출력해줘.\nSPEC: ${JSON.stringify(spec)}${referenceNote}`,
      },
    ],
  };
}

/** Body for the HTML-editor call (Phase 10): minimally edit existing HTML. */
function htmlEditBody(instruction: string, currentHtml: string) {
  // The edited output is ~the same size as the input, which is already in the
  // prompt. On the free tier (TPM 8000 counts prompt+max_tokens together),
  // budget output to the input size plus slack, capped at MAX_TOKENS.
  const approxInputTokens = Math.ceil(currentHtml.length / 3);
  const maxTokens = Math.min(MAX_TOKENS, Math.max(1500, approxInputTokens + 600));
  return {
    model: HTML_MODEL,
    temperature: 0.2, // low — we want faithful minimal edits, not creativity
    seed: SEED,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: HTML_EDIT_GUIDE },
      {
        role: 'user',
        content: `[현재 화면 HTML]\n${currentHtml}\n\n[수정 요청]\n${instruction}\n\n위 수정 요청만 반영한 완전한 HTML 문서를 출력해줘. 나머지는 그대로.`,
      },
    ],
  };
}

/** Fallback document when the model returns no usable HTML. */
const HTML_FALLBACK =
  '<!DOCTYPE html><html><body style="font-family:sans-serif;padding:24px;color:#71717a">화면 생성에 실패했습니다. 다시 시도해 주세요.</body></html>';

interface PlanResult {
  questions?: ClarifyingQuestion[]; // set when the engine chose to ask instead
  edit?: { instruction: string; currentHtml: string; spec: DesignSpec }; // localized edit path
  spec?: DesignSpec;
  textMessages?: { role: string; content: string }[];
  referenceNote?: string;
}

/**
 * Run the planner (+ optional vision description). Returns either clarifying
 * questions or the inputs needed to author the HTML. Shared by both paths.
 */
async function planDesign(apiKey: string, req: GenerateRequest): Promise<PlanResult> {
  const lastUser = [...req.messages].reverse().find((m) => m.role === 'user');
  const prompt = lastUser?.content ?? '';
  const hasImages = !!(lastUser?.images && lastUser.images.length);
  const textMessages = req.messages.map((m) => ({ role: m.role, content: m.content }));

  const hasCurrentHtml = typeof req.currentHtml === 'string' && req.currentHtml.length > 0;
  const plannerSystem = req.currentSpec
    ? `${PLANNER_PROMPT}\n\n[CURRENT_SPEC — 현재 화면 설계. 최신 지시로 이것을 수정하라]\n${JSON.stringify(req.currentSpec)}`
    : PLANNER_PROMPT;
  const imageHint = hasImages
    ? '\n\n[참고: 사용자가 레퍼런스 이미지를 첨부했다. 이미지는 별도 분석되어 반영되니, 텍스트만으로 판단해 되도록 mode="design"으로 진행하라.]'
    : '';
  const editHint = hasCurrentHtml
    ? '\n\n[참고: 이미 만든 화면이 있다. 사용자의 마지막 지시가 그 화면의 일부만 바꾸는 국소 수정이면 mode="edit"으로 답하라(레이아웃/유형이 통째로 바뀌면 design).]'
    : '';
  const plannerHint = imageHint + editHint;

  const plannerRaw = await callGroq(
    apiKey,
    {
      model: HTML_MODEL,
      temperature: 0.4,
      seed: SEED,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: plannerSystem + plannerHint }, ...textMessages],
    },
    'planner',
  );

  let plan: PlannerPayload;
  try {
    const cleaned = stripThink(plannerRaw);
    const jsonText = cleaned.startsWith('{') ? cleaned : (cleaned.match(/\{[\s\S]*\}/)?.[0] ?? cleaned);
    plan = JSON.parse(jsonText);
  } catch {
    throw new EngineError(
      '설계 분석에 실패했습니다. 다시 시도해 주세요.',
      `planner non-JSON: ${plannerRaw.slice(0, 200)}`,
    );
  }

  // Localized edit path: reuse the current spec, edit the current HTML directly.
  if (plan.mode === 'edit' && hasCurrentHtml && req.currentSpec) {
    return { edit: { instruction: prompt, currentHtml: req.currentHtml as string, spec: req.currentSpec } };
  }

  if (plan.mode === 'questions' && !plan.spec) {
    const questions = coerceQuestions(plan.questions);
    if (questions.length) return { questions };
  }

  const spec = coerceSpec(plan.spec ?? {}, prompt);

  let referenceNote = '';
  if (hasImages && lastUser) {
    try {
      const desc = await describeReferences(apiKey, lastUser);
      if (desc) referenceNote = `\n\n[레퍼런스 이미지 분석 — 이 구조/감각을 NH 톤으로 재해석해 반영]\n${desc}`;
    } catch (e) {
      console.error('[groq] reference description failed (continuing without it)', e);
    }
  }

  return { spec, textMessages, referenceNote };
}

export function createGroqEngine(apiKey: string): DesignEngine {
  return {
    async generate(req: GenerateRequest): Promise<EngineOutput> {
      const plan = await planDesign(apiKey, req);
      if (plan.questions) return { mode: 'questions', questions: plan.questions };

      // Localized edit: minimally edit the current HTML, keep the current spec.
      if (plan.edit) {
        const raw = await callGroq(apiKey, htmlEditBody(plan.edit.instruction, plan.edit.currentHtml), 'html-edit');
        const html = stripFence(raw);
        const wireframeHtml = html.includes('<') ? html : plan.edit.currentHtml;
        return {
          mode: 'design',
          spec: plan.edit.spec,
          wireframeHtml,
          specMarkdown: renderSpecMarkdown(plan.edit.spec),
        };
      }

      const spec = plan.spec!;
      const htmlRaw = await callGroq(
        apiKey,
        htmlAuthorBody(req, spec, plan.textMessages!, plan.referenceNote ?? ''),
        'html',
      );
      const html = stripFence(htmlRaw);
      const wireframeHtml = html.includes('<') ? html : HTML_FALLBACK;
      return { mode: 'design', spec, wireframeHtml, specMarkdown: renderSpecMarkdown(spec) };
    },

    async *generateStream(req: GenerateRequest): AsyncGenerator<StreamEvent> {
      yield { type: 'status', message: '요구사항을 분석하고 있어요…' };
      let plan: PlanResult;
      try {
        plan = await planDesign(apiKey, req);
      } catch (e) {
        yield {
          type: 'error',
          message: e instanceof EngineError ? e.userMessage : '화면 생성 중 오류가 발생했습니다.',
        };
        return;
      }

      if (plan.questions) {
        yield { type: 'questions', questions: plan.questions };
        return;
      }

      // Localized edit path (Phase 10): stream the minimally-edited HTML.
      if (plan.edit) {
        const edit = plan.edit;
        yield { type: 'status', message: '요청하신 부분만 수정하고 있어요…' };
        let editRaw = '';
        try {
          for await (const delta of callGroqStream(
            apiKey,
            htmlEditBody(edit.instruction, edit.currentHtml),
            'html-edit',
          )) {
            editRaw += delta;
            yield { type: 'html', delta };
          }
        } catch (e) {
          if (!editRaw) {
            yield {
              type: 'error',
              message: e instanceof EngineError ? e.userMessage : '수정 중 오류가 발생했습니다.',
            };
            return;
          }
        }
        const editedHtml = stripFence(editRaw);
        const wireframeHtml = editedHtml.includes('<') ? editedHtml : edit.currentHtml;
        yield {
          type: 'done',
          result: { spec: edit.spec, wireframeHtml, specMarkdown: renderSpecMarkdown(edit.spec) },
        };
        return;
      }

      const spec = plan.spec!;
      yield { type: 'status', message: '화면을 그리고 있어요…' };

      let raw = '';
      try {
        for await (const delta of callGroqStream(
          apiKey,
          htmlAuthorBody(req, spec, plan.textMessages!, plan.referenceNote ?? ''),
          'html',
        )) {
          raw += delta;
          yield { type: 'html', delta };
        }
      } catch (e) {
        // If nothing streamed yet, surface the error; otherwise finish with what we have.
        if (!raw) {
          yield {
            type: 'error',
            message: e instanceof EngineError ? e.userMessage : '화면 생성 중 오류가 발생했습니다.',
          };
          return;
        }
      }

      const html = stripFence(raw);
      const wireframeHtml = html.includes('<') ? html : HTML_FALLBACK;
      yield { type: 'done', result: { spec, wireframeHtml, specMarkdown: renderSpecMarkdown(spec) } };
    },
  };
}
