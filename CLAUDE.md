# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

# DesignMate

## 목표

자연어 요구사항을 입력하면 **UI/UX 정의서**와 **와이어프레임(HTML/CSS 목업)** 을 생성하는 웹앱. Render 호스팅. `GROQ_API_KEY`가 있으면 Groq(LLM)가 정의서+HTML을 생성하고, 없으면 규칙 엔진으로 폴백한다. 두 엔진 모두 동일한 `DesignEngine` 인터페이스를 구현하며, 다른 LLM으로도 `getEngine()` 한 곳에서 교체 가능.

## 스택

- **Next.js 14 (App Router) + TypeScript**, 앱 루트는 `designmate-app/`. **Node 22+**(`node:sqlite` 내장 사용).
- 별도 UI 라이브러리·상태관리·마크다운·DB·인증 라이브러리 없음 — 런타임 의존성은 `next`/`react`만 (SQLite는 Node 내장 `node:sqlite`, 해싱·세션은 내장 `crypto`)
- 실행: `npm run dev` (개발), `npm run build && npm start` (프로덕션, `PORT` 자동)

## 구조

```
designmate-app/
├── app/
│   ├── page.tsx                # 로그인 게이트 + 입력창 + 정의서/와이어프레임 2분할 뷰 (클라)
│   ├── layout.tsx, globals.css # 루트 레이아웃 + 앱 스타일
│   ├── api/generate/route.ts   # POST { messages } → { spec, wireframeHtml, specMarkdown } (SSE)
│   ├── api/auth/…              # register/login/logout/me (자체 ID/PW 세션)
│   └── api/projects/…          # GET 목록 / [id] GET·PUT·DELETE (계정별 소유권 WHERE user_id)
├── lib/
│   ├── db.ts                   # node:sqlite 싱글턴 + 스키마 부트스트랩 (globalThis 캐싱)
│   ├── auth.ts                 # scrypt 해싱 + DB 세션(httpOnly 쿠키) + getSessionUser
│   ├── projects.ts             # 계정 스코프 프로젝트 CRUD (turns는 turns_json blob)
│   ├── engine/
│   │   ├── types.ts            # DesignEngine 인터페이스, DesignSpec/GenerateResult/StreamEvent
│   │   ├── groqEngine.ts       # Groq(OpenAI 호환) → spec+html (스트리밍/국소수정)
│   │   ├── ruleEngine.ts       # 오프라인 폴백: 키워드 → 화면유형/NH도메인 + 템플릿
│   │   ├── cache.ts            # 동일요청 인메모리 LRU (DB 무관)
│   │   └── index.ts            # getEngine() ← GROQ_API_KEY 유무로 엔진 선택 (단일 스왑 지점)
│   ├── templates/              # 화면유형별 HTML/CSS 목업 생성기 (list…report 8종)
│   ├── designTokens.ts         # NH 디자인 토큰 SSOT
│   ├── spec.ts                 # DesignSpec → 정의서 마크다운
│   └── markdown.ts             # 정의서 마크다운 → HTML (경량 렌더러, 범용 아님)
├── components/                 # SpecPanel, WireframePreview, AuthGate
└── data/                       # (gitignore) SQLite 파일
```

**저장/인증 원칙**: 모든 영속 데이터는 서버 SQLite(`lib/db.ts`). 프로젝트는 로그인 계정 소유이며 route에서 `getSessionUser()` + SQL `WHERE user_id`로 항상 소유권 강제. DB/쿠키를 만지는 route는 `export const dynamic = 'force-dynamic'`(빌드 시 정적 수집 방지). 알파 수준 — 정식 출시엔 SSO·rate limit·감사 별도.

## 핵심 원칙 (변경 금지)

1. **와이어프레임 톤은 저충실도** — 회색조 + 점선 테두리 + 플레이스홀더. 실제 서비스 UI처럼 보이게 하지 않는다. 와이어프레임 스타일의 단일 진실 공급원은 `lib/templates/shared.ts`의 `wrapDocument()`.
2. **와이어프레임 HTML은 항상 iframe `srcDoc` + `sandbox="allow-same-origin"`으로 렌더** — 메인 앱 스타일과 격리, 스크립트 미실행. 직접 `dangerouslySetInnerHTML`로 와이어프레임을 주입하지 않는다.
3. **엔진 교체는 `getEngine()` 한 곳에서만** — 새 엔진은 `DesignEngine` 인터페이스(`generate(prompt) → { spec, wireframeHtml, specMarkdown }`)를 구현하고, `page.tsx`/API는 손대지 않는다. Groq 응답은 신뢰할 수 없으므로 `groqEngine.ts`의 `coerceSpec()`으로 항상 방어적으로 정규화한다.
4. **의존성 추가 지양** — 마크다운·아이콘·UI 라이브러리 등은 꼭 필요할 때만. `lib/markdown.ts`는 `spec.ts`가 만드는 구문(제목/굵게/목록/표)만 지원하는 최소 렌더러다.
5. `화면 유형`은 `list | detail | form | dashboard | auth` 다섯 가지. 새 유형 추가 시 `types.ts`의 `ScreenType`, `ruleEngine.ts`의 규칙·spec, `templates/`의 생성기, `BODY_BY_TYPE` 매핑을 함께 갱신한다.

## 검증

- 빌드/타입체크: `cd designmate-app && npm run build`
- E2E: `npm run dev` → `localhost:3000`에서 예시 칩 클릭 또는 프롬프트 입력 → 좌 정의서 / 우 와이어프레임 확인
- API 단독: `POST /api/generate {"prompt":"..."}` → `spec.screenType`이 프롬프트 키워드와 일치하는지 확인 (빈 프롬프트는 400)
