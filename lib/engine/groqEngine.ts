import type {
  ChatMessage,
  ClarifyingQuestion,
  DesignEngine,
  DesignSpec,
  EngineOutput,
  GenerateRequest,
  ScreenType,
} from './types';
import { renderSpecMarkdown } from '../spec';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
// HTML author: larger model produces markedly better UI. Text-only.
const HTML_MODEL = process.env.GROQ_HTML_MODEL || 'openai/gpt-oss-120b';
// Planner + vision: smaller multimodal model handles JSON decisions and image analysis.
const VISION_MODEL = process.env.GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';
// Free-tier TPM cap is 8000 (prompt + max_tokens counted together);
// leave headroom for the system prompt, spec, and conversation history.
const MAX_TOKENS = 5500;

const SCREEN_TYPES: ScreenType[] = ['list', 'detail', 'form', 'dashboard', 'auth'];

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

반드시 아래 JSON 하나만 출력한다. 코드펜스·설명 금지.

(A) 되물을 때:
{ "mode":"questions", "questions":[ { "question":"...", "options":["...","..."] } ] }

(B) 설계할 때 (spec만, HTML은 넣지 않는다):
{
  "mode":"design",
  "spec":{
    "title":"화면 제목 (24자 이내)",
    "screenType":"list | detail | form | dashboard | auth 중 하나",
    "domain":"도메인 (예: 여신, 수신, 조합원관리, 일반 등)",
    "summary":"이 화면이 무엇을 하는지 1~2문장",
    "screens":[{ "name":"화면명","purpose":"목적","components":["요소1","요소2"] }],
    "components":[{ "name":"컴포넌트명","description":"설명","states":["기본","오류"] }],
    "userFlow":["단계1","단계2"],
    "designNotes":["유의점 (레퍼런스 이미지가 있으면 무엇을 참고할지 한 줄 포함)"]
  }
}`;

// --- Call B: HTML author. Plain-text output (NOT JSON) so large HTML isn't truncated. ---
const HTML_STYLE_GUIDE = `너는 NH농협 사내 시스템 프론트엔드 개발자다. 주어진 설계(SPEC)와 요구사항을 바탕으로 실제 서비스 수준의 고충실도 화면 HTML을 만든다.

출력 규칙:
- <!DOCTYPE html> 로 시작하는 완전한 standalone HTML 문서 하나만 출력한다. 코드펜스(\`\`\`)·설명 문장 금지.
- 모든 CSS는 <head>의 <style>에 인라인. <script> 금지(정적 목업).

${NH_CONTEXT}

디자인:
- NH 브랜드 톤: 주색 #00873c(딥그린), 진한 변형 #006b30, 옅은 배경 #e6f3ec. 본문 #1f2a24, 보조 #6b7a72, 경계선 #dbe3de, 페이지 배경 #f4f6f5, 카드 #ffffff. 위험 #c0392b.
- 실제 UI 품질: 적절한 여백(16~24px), 카드/패널 라운드(10~14px)+옅은 그림자, 타이포 위계(제목 18~22px 700, 본문 14px), 버튼·뱃지·탭·테이블·폼에 realistic 스타일.
- 회색 플레이스홀더·점선 와이어프레임 톤 금지. 그럴듯한 예시 값(한국식 이름·금액·날짜·계좌번호 등)을 채운다.
- 상태는 색 뱃지로(승인=초록, 반려=빨강, 대기=회색). list/dashboard는 테이블·카드 그리드로 정보 밀도 있게. 폼은 라벨-입력 정렬 깔끔하게.
- 요구/레퍼런스의 구체 요소(필드·컬럼·섹션·버튼)를 실제 반영. 일반 껍데기 금지.
- 레이아웃 폭: 대시보드/목록은 최대 1100px 중앙 정렬, 단순 조회/폼은 640~800px.
- 반드시 반응형: @media (max-width:768px)에서 다단→1단, 테이블은 overflow-x:auto 또는 카드형 전환, 여백·글자 조정. 터치 타깃 최소 44px.
- 한국어 라벨. 아이콘은 이모지/유니코드/인라인 SVG.

[레퍼런스 이미지가 첨부된 경우] 레이아웃 구조·컴포넌트 배치·정보 위계·여백 감각을 참고하되, NH 브랜드 톤과 사내 맥락에 맞게 재해석한다. 그대로 베끼지 말 것.`;

interface PlannerPayload {
  mode?: 'questions' | 'design';
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
      return { question: q.question, options: options.slice(0, 4) };
    })
    .filter((q): q is ClarifyingQuestion => q !== null)
    .slice(0, 4);
}

function coerceSpec(raw: Partial<DesignSpec>, prompt: string): DesignSpec {
  const screenType = SCREEN_TYPES.includes(raw.screenType as ScreenType)
    ? (raw.screenType as ScreenType)
    : 'list';
  return {
    title: raw.title?.trim() || prompt.slice(0, 24),
    screenType,
    domain: raw.domain?.trim() || '일반',
    summary: raw.summary?.trim() || '',
    screens: Array.isArray(raw.screens) ? raw.screens : [],
    components: Array.isArray(raw.components) ? raw.components : [],
    userFlow: Array.isArray(raw.userFlow) ? raw.userFlow : [],
    designNotes: Array.isArray(raw.designNotes) ? raw.designNotes : [],
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

/** Strip an accidental ```html ... ``` code fence the model sometimes adds. */
function stripFence(s: string): string {
  const t = s.trim();
  const fence = t.match(/^```(?:html)?\s*([\s\S]*?)\s*```$/i);
  return (fence ? fence[1] : t).trim();
}

async function callGroq(apiKey: string, body: object): Promise<string> {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Groq API 오류 (${res.status}): ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? '';
}

/** Ask the vision model to describe reference images as text (for the text-only HTML model). */
async function describeReferences(apiKey: string, message: ChatMessage): Promise<string> {
  const raw = await callGroq(apiKey, {
    model: VISION_MODEL,
    temperature: 0.3,
    max_tokens: 900,
    messages: [
      {
        role: 'system',
        content:
          '첨부된 레퍼런스 UI 이미지를 분석해, 레이아웃 구조·주요 컴포넌트 배치·정보 위계·색/여백 감각을 한국어로 간결히 서술한다. HTML을 만들지 말고 설명만.',
      },
      toApiMessage(message),
    ],
  });
  return raw.trim();
}

export function createGroqEngine(apiKey: string): DesignEngine {
  return {
    async generate(req: GenerateRequest): Promise<EngineOutput> {
      const lastUser = [...req.messages].reverse().find((m) => m.role === 'user');
      const prompt = lastUser?.content ?? '';
      const hasImages = !!(lastUser?.images && lastUser.images.length);
      // History as plain text; images are handled separately via the vision model.
      const textMessages = req.messages.map((m) => ({ role: m.role, content: m.content }));

      // --- Call A: planner (JSON mode, vision model so it can see any images) ---
      const plannerSystem = req.currentSpec
        ? `${PLANNER_PROMPT}\n\n[CURRENT_SPEC — 현재 화면 설계. 최신 지시로 이것을 수정하라]\n${JSON.stringify(req.currentSpec)}`
        : PLANNER_PROMPT;

      const plannerRaw = await callGroq(apiKey, {
        model: VISION_MODEL,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: plannerSystem }, ...req.messages.map(toApiMessage)],
      });

      let plan: PlannerPayload;
      try {
        plan = JSON.parse(plannerRaw);
      } catch {
        throw new Error('설계 판단 응답을 해석하지 못했습니다.');
      }

      if (plan.mode === 'questions' && !plan.spec) {
        const questions = coerceQuestions(plan.questions);
        if (questions.length) return { mode: 'questions', questions };
      }

      const spec = coerceSpec(plan.spec ?? {}, prompt);

      // If a reference image was attached, describe it in text for the HTML model.
      let referenceNote = '';
      if (hasImages && lastUser) {
        try {
          const desc = await describeReferences(apiKey, lastUser);
          if (desc) referenceNote = `\n\n[레퍼런스 이미지 분석 — 이 구조/감각을 NH 톤으로 재해석해 반영]\n${desc}`;
        } catch {
          /* reference description is best-effort */
        }
      }

      // --- Call B: HTML author (large text model, no images) ---
      const htmlSystem = req.currentSpec
        ? `${HTML_STYLE_GUIDE}\n\n[직전 화면 HTML을 최신 지시대로 수정하되, 무관한 부분은 유지한다.]`
        : HTML_STYLE_GUIDE;

      const htmlRaw = await callGroq(apiKey, {
        model: HTML_MODEL,
        temperature: 0.5,
        max_tokens: MAX_TOKENS,
        messages: [
          { role: 'system', content: htmlSystem },
          ...textMessages,
          {
            role: 'user',
            content: `위 요구사항과 아래 SPEC을 반영한 완전한 HTML 문서를 출력해줘.\nSPEC: ${JSON.stringify(spec)}${referenceNote}`,
          },
        ],
      });

      const html = stripFence(htmlRaw);
      const wireframeHtml = html.includes('<')
        ? html
        : '<!DOCTYPE html><html><body style="font-family:sans-serif;padding:24px;color:#71717a">화면 생성에 실패했습니다. 다시 시도해 주세요.</body></html>';

      return { mode: 'design', spec, wireframeHtml, specMarkdown: renderSpecMarkdown(spec) };
    },
  };
}
