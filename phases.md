# DesignMate 개선 내역 (phases)

NH농협 사내 화면 설계 도우미의 개선 작업을 시간순으로 누적 기록한다.
각 페이즈 완료 시 리포트 → 사용자 커밋&푸시 컨펌 → 반영.

---

## Phase 1 — 핵심 안정성 + UX 번들 (2026-07-04)

**배경:** 기능은 동작하나 "실무 레벨이 아니다"는 피드백. 3개 조사 에이전트로 전수조사 후,
체감 품질을 떨어뜨리는 안정성·UX·보안 문제에 집중.

### A. 엔진 안정성 — `lib/engine/groqEngine.ts`

- `callGroq()`에 **60초 타임아웃**(AbortController) 추가 — 무한 로딩 방지
- **429/5xx 자동 재시도**(최대 2회, Retry-After 존중) — free-tier rate limit 대응
- HTTP 상태별 **사용자 친화 에러 메시지** 매핑(401/413/429/5xx/timeout), 원본은 서버 로그만
- **경량 로깅**: 호출별 모델·소요시간·상태·재시도 횟수 (`console.info/error`)
- planner 호출에 `max_tokens: 1500` — JSON 잘림 방지
- `EngineError` 클래스 도입(사용자 메시지 / 로그 상세 분리)

### B. 입력 검증·보안 — `app/api/generate/route.ts`, `lib/markdown.ts`

- 이미지 **MIME 화이트리스트**(png/jpg/webp/gif) — svg 등 XSS 벡터 차단
- 이미지 **크기 상한 4MB**·개수 5개 서버측 강제, 초과 시 400
- 텍스트 입력 길이 상한(8000자)
- `currentSpec` **형 검증** 후 사용(잘못된 형이면 무시)
- 에러 응답 정제: 클라이언트엔 안전한 메시지만, 상세는 서버 로그
- markdown escape에 `"`,`'` 추가 — 속성 컨텍스트 XSS 방어

### C. 프론트 안정성·상태 — `app/page.tsx`, `app/error.tsx`

- 로딩 중 **요청 취소** 버튼(AbortController)
- 실패 시 **다시 시도** 버튼(마지막 입력 유지)
- **localStorage 용량 보호**: base64 이미지는 저장 제외, QuotaExceeded 시 오래된 turn부터 잘라 재시도, 최근 40턴 상한
- **에러 바운더리**(`error.tsx`) — 렌더 오류 시 흰 화면 대신 복구 UI
- 복사 시 **"복사됨" 피드백**

### D. 결과물 내보내기 — `app/page.tsx`

- 와이어프레임 **HTML 다운로드**(.html)
- 정의서 **Markdown 다운로드**(.md)

### E. 환경변수 경고 — `lib/engine/index.ts`

- `GROQ_API_KEY` 미설정 시 `console.warn` — 조용한 저품질 폴백 방지

### 검증 결과

- `npm run build` 통과(타입 포함)
- SVG 이미지 첨부 → 400 ✓ / 빈 입력 → 400 ✓ / 정상 요청 → design + HTML ✓
- 서버 로그에 `[groq] planner ... ok 992ms`, `[groq] html ... ok 4062ms` 출력 확인 ✓

### 제외(백로그)

- 테스트/CI/ESLint/Prettier, render.yaml, /api/health
- 컴포넌트 분리 리팩토링, 다중 프로젝트 히스토리(DB), 스트리밍(SSE)

---

## Phase 2 — Next.js 보안 패치 (2026-07-17)

**배경:** 조사에서 Next.js 14.2.5의 취약점(critical 포함)이 다수 발견됨. 실배포 상태라 시급.

### 변경 — `package.json`

- `next` **14.2.5 → 14.2.35** (14.2.x 내 패치, breaking change 없음). postcss 전이 취약점도 함께 해소.
- `engines.node: ">=18.18.0"` 추가 — 배포/로컬 Node 버전 하한 고정.

### 판단 — 남은 advisory는 수용

- `npm audit`이 완전 제거하려면 **next@16(major)** 를 요구하나, App Router breaking 위험이 커 이번 범위 밖.
- 남은 항목은 이 앱이 쓰지 않는 기능(next/image 최적화, i18n 미들웨어, CSP nonce, RSC 캐시 등)이라 실질 위험 낮음 → 14.2.35에서 정지.

### 검증

- `npm install` 후 `npm run build` 통과 ✓ (critical → 해소, 잔여는 위 수용 항목)

---

## Phase M — 모바일 반응형 수정 (2026-07-17)

**배경:** 모바일에서 화면이 뭉개짐. 근본 원인은 뷰포트 메타 부재 + 데스크톱 전용 2분할 레이아웃.

### 변경

- **`app/layout.tsx`**: `viewport`(width=device-width, initialScale=1) 추가 — 모바일 렌더의 근본 수정. (pinch-zoom은 접근성 위해 허용)
- **`app/page.tsx`**: 모바일 전용 **대화/결과 세그먼트 토글**(`mobileView` 상태). 생성 성공 시 자동으로 '결과'로 전환. 데스크톱은 기존 2분할 유지(토글 숨김).
- **`app/globals.css`**: `@media (max-width:768px)` 블록 신설 — 헤더 축소·설명 숨김, 토글 표시, 한 번에 한 패널만 전체 높이, 결과 내부 세로 스택, 입력창 16px(iOS 확대 방지)·터치 타깃 48px, 헤더 버튼 줄바꿈, 여백 조정.

### 검증 (헤드리스 크롬 390px)

- 초기 대화 뷰: 헤더·칩·입력창 온전, 글자 정상 크기 ✓
- 실제 E2E 생성 → '결과' 탭 자동 전환, 정의서·표 잘림 없음, 헤더 버튼 줄바꿈 ✓
- 데스크톱(1280px) 회귀: 기존 2분할 그대로 ✓
- `npm run build` 통과 ✓

---

## Hotfix — Groq 비전 모델 교체 (2026-08-06)

**배경:** `meta-llama/llama-4-scout-17b-16e-instruct`가 Groq에서 퇴출(404 model_not_found)되어 모든 요청 실패. 무료 모델은 예고 없이 사라짐.

### 조사

- Groq `/models` 조회 → 현재 비전 지원은 `qwen/qwen3.6-27b`가 유일. `gpt-oss-120b`는 텍스트 전용(이미지 넣으면 400).
- qwen은 `<think>…</think>` 추론 블록을 뱉어 **json_object 모드에서 검증 실패**(planner 부적합).

### 변경 — `lib/engine/groqEngine.ts`

- **planner(JSON 판단+spec)를 `gpt-oss-120b`로 이전** — 텍스트 전용 메시지로 호출(이미지는 제거). 신뢰성 있는 JSON 확보. 이미지 첨부 시엔 "이미지는 별도 분석되니 design으로 진행" 힌트 추가.
- **`VISION_MODEL` = `qwen/qwen3.6-27b`** — `describeReferences`(이미지→텍스트 분석)에만 사용.
- `stripThink()` 추가 — qwen의 `<think>` 블록 제거(describe/planner 파싱 방어). vision max_tokens 1600, planner 2000으로 상향.
- `.env.local.example`의 `GROQ_VISION_MODEL` 기본값 갱신.

### 검증 (dev E2E)

- 텍스트 생성: design + HTML 6664자 ✓
- 이미지 참조: qwen이 3-컬럼 레이아웃 분석 → designNotes에 반영, HTML 10367자 ✓
- 로그: `planner ok(gpt-oss-120b)`, `vision ok(qwen)`, `html ok(gpt-oss-120b)`; 429 발생 시 재시도로 자동 복구(attempt=1 ok) ✓
- `npm run build` 통과 ✓

---

## Bugfix — 와이어프레임 미리보기 클릭 무력화 (2026-08-08)

**배경:** 생성된 화면(정적 목업) 안의 링크/버튼/폼을 누르면 미리보기 iframe이 실제로 페이지 이동·폼 제출을 시도해 화면이 깨졌다. (`sandbox="allow-same-origin"`은 스크립트/폼제출은 막지만 `<a href>` 내비게이션은 iframe 내부에서 발생.)

### 변경 — `components/WireframePreview.tsx`

- 미리보기용 HTML의 `<head>`에 `pointer-events:none` 스타일 스니펫 주입(`makeInert`) — a/button/input/form 등 인터랙션 요소 클릭을 무력화. 목업이므로 눌러도 그대로 유지.
- **다운로드되는 HTML은 원본 그대로**(주입은 미리보기 전용) — 실제 산출물은 작동 상태 유지.

### 검증 (헤드리스 크롬 A/B)

- 수정 전: 링크 클릭 → `example.com/gone`으로 이동됨(버그 재현) ✓
- 수정 후: 링크 클릭 → `about:blank` 그대로, 이동 없음 ✓
- `npm run build` 통과 ✓

---

## Phase 3 — 품질 도구 (2026-08-08)

**배경:** ESLint 설정 파일이 없어 `next lint`가 CI에서 대화형 프롬프트로 멈추고, 포맷터·타입체크 스크립트가 없었다.

### 변경

- **ESLint**: `eslint@8` + `eslint-config-next@14.2.35` 추가, `.eslintrc.json`(`next/core-web-vitals`) 생성.
- **Prettier**: `prettier@3` 추가, `.prettierrc.json`(singleQuote, trailingComma:all, printWidth:120) + `.prettierignore`. 전체 소스 1회 포맷 정렬(17개 파일).
- **package.json 스크립트**: `typecheck`(tsc --noEmit), `format`, `format:check` 추가. `engines.node` 유지.

### 검증

- `npm run lint` → No ESLint warnings or errors ✓
- `npm run typecheck` → exit 0 ✓
- `npm run format:check` → All matched files use Prettier code style ✓
- `npm run build` 통과 ✓
- 참고: `npm audit`의 잔여 항목은 next@16(major) 필요분(수용) + dev 전용 eslint 의존성이라 런타임 영향 없음.

---

## Phase 4 — 접근성 (2026-08-08)

**배경:** 폼 요소에 라벨이 없고(placeholder만), 일부 토글/상태에 스크린리더 힌트가 없으며, 키보드 포커스 링이 보장되지 않았다.

### 변경 — `app/page.tsx`, `components/WireframePreview.tsx`, `app/globals.css`

- **textarea**에 `aria-label="요구사항 입력"` 추가.
- **로딩 표시**에 `role="status" aria-live="polite"` — 생성 진행을 스크린리더가 안내.
- **와이어프레임 크기 토글**: `role="group"` + 각 버튼 `aria-pressed`, iframe `title`에 현재 뷰(데스크톱/모바일) 명시.
- **질문 카드**: 각 질문 `role="group" aria-label`, 옵션 버튼 `aria-pressed`로 선택 상태 노출.
- **전역 `:focus-visible`** 포커스 링(NH 그린) 추가 — 키보드 탐색 시 위치가 항상 보임(마우스 클릭은 깨끗).
- (기존) 에러 `role="alert"`, 첨부/제거 버튼 `aria-label`, 모바일 탭 `role="tablist"`는 유지.

### 검증

- 헤드리스 크롬에서 Tab 이동 → 예시 칩에 NH 그린 포커스 링 렌더 확인(스크린샷) ✓
- `npm run lint` / `typecheck` / `format:check` / `build` 모두 통과 ✓

---

## Phase 5 — 다중 프로젝트 히스토리 (2026-08-08)

**배경:** 단일 세션만 저장돼 "새 대화"를 시작하면 이전 작업이 사라졌다. 여러 프로젝트를 저장·전환·삭제할 수 있게 함.

### 변경 — `app/page.tsx`, `app/globals.css`

- **저장 구조 변경**: `{ turns }`(단일) → `{ projects: [{id,title,turns,updatedAt}], activeId }`. 기존 `session.v2`가 있으면 첫 프로젝트로 **자동 마이그레이션**.
- **좌측 드로우어**: 헤더의 NH 로고/"☰ 프로젝트 (n)" 버튼으로 열림. 프로젝트 목록(제목·시간), 클릭 전환, ✕ 삭제, "새 대화 시작".
- **자동 제목**: 프로젝트의 첫 design 결과 `spec.title`을 제목으로 사용(없으면 "새 프로젝트").
- **"새 대화"**는 새 프로젝트 생성(기존 것은 드로우어에 보존).
- **quota 보호 확장**: 초과 시 가장 오래된 프로젝트부터 제거, 마지막 하나 남으면 turns를 절반씩 축소(`persistStore`). 프로젝트 상한 30개.

### 검증 (헤드리스 크롬 E2E)

- 생성 → 프로젝트 1개 자동 저장 ✓
- "새 대화" → 대화 스레드 비워짐(말풍선 0) ✓
- 두 번째 생성 → 드로우어에 프로젝트 2개, 헤더 "프로젝트 (2)" ✓
- 항목 클릭 → 해당 대화(질문 카드 포함) 그대로 복원 ✓
- `npm run lint` / `typecheck` / `format:check` / `build` 모두 통과 ✓

---

## 고도화 착수 계획 (2026-08-08 승인) — 축 B 제외, A·C·UX 전체

**배경:** 부서장 보고서(`plans/cuddly-drifting-blossom.md`) 검토 후, 사용자가 **축 B(협업·공유·유통)를 제외한 나머지 전부**를 처리하도록 지시.
관문(B1~B5: 인증·데이터주권·서버DB·가용성)은 타 부서 협의가 필요한 별도 트랙이라 이번 코드 착수 범위에서 제외.

**착수 범위 (앱 코드로 순수 처리 가능한 것):**

- **축 A — 산출물 품질·신뢰성**
  - A1. 정의서 구조 심화 (데이터 필드 명세·권한 매트릭스·예외/오류·연계·비기능) — `DesignSpec` 스키마 확장 + 프롬프트 + `spec.ts` 렌더 + `coerceSpec` 방어
  - A2. 추적성·버전 (요구사항 ID↔화면 ID, 작성자·일자, 버전 잠금) — 로컬 저장 계층 내에서 버전 스냅샷
  - A3. 화면 유형 확장 (승인/결재 워크플로우 등) — `ScreenType` 확장, 규칙엔진·프롬프트·라벨 동기화
  - A4. 재현성 — 서버 저장(B4/관문) 의존분은 제외, LLM seed/temperature 고정 + 규칙엔진 폴백 품질 개선 범위만
- **축 C — 편집·상호작용·디자인 일관성**
  - C1. 와이어프레임 직접 편집 — 난이도 높음, 단계적. LLM 재생성 외 최소 편집 수단부터
  - C2. NH 디자인 시스템 토큰 — 프롬프트 색상 지시 → 공유 토큰 SSOT로 일관화
  - C3. 온보딩 — 첫 사용자 가이드·프롬프트 팁·기능 안내
  - C4. 생성 산출물 접근성 — LLM HTML의 KWCAG 준수 프롬프트 가이드
- **UX 즉효**
  - 응답 스트리밍(SSE) — 현 구조 최대 체감 개선
  - 결과/이미지분석 캐싱

**진행 방식:** 각 항목을 개별 Phase로 쪼개 리포트 → 커밋&푸시 컨펌 → 본 파일 기록. 관문(축 B·인증·서버DB)은 손대지 않음.

> _(이 블록은 compact 전 현재 작업 상태 기록. 이하 각 Phase 완료 시 아래에 누적.)_

---

## Phase 6 — 캐싱 + DS 토큰 SSOT + 산출물 접근성 (2026-08-08)

**배경:** 고도화 착수의 첫 묶음. 저위험·고체감 항목을 먼저 처리 — 동일요청 캐싱(UX 즉효), C2(디자인 토큰 단일화), C4(생성 HTML 접근성).

### 변경

- **C2. NH 디자인 토큰 SSOT** — `lib/designTokens.ts` 신설. 색/타이포/간격/상태색을 타입화해 한 곳에 정의하고, `colorGuideLine()`·`stylingGuideLine()`로 프롬프트 문자열을 조립. `groqEngine.ts`의 `HTML_STYLE_GUIDE`가 이 값을 참조하도록 변경 → 톤 변경 지점을 프롬프트 산문에서 토큰 모듈 한 곳으로 이동. (와이어프레임 저충실도 톤 SSOT는 기존대로 `templates/shared.ts` 분리 유지.)
- **C4. 생성 산출물 접근성** — `HTML_STYLE_GUIDE`에 KWCAG/WCAG AA 가이드 블록 추가: 시맨틱 마크업(header/nav/main/table+scope/label), 폼 label 연결, 아이콘 aria-label, img alt, 명도 대비 4.5:1, 상태를 색+텍스트/아이콘 병기, heading 위계.
- **캐싱(동일요청 메모리 LRU)** — `lib/engine/cache.ts` 신설. 요청 전체(messages+images+currentSpec)를 키로 완결 산출물(mode:'design')만 캐시(최대 50, LRU). `app/api/generate/route.ts`에서 엔진 호출 전 조회·후 저장 → 엔진 무관(그록/규칙 공통). 서버 메모리에만 존재, 콜드스타트 시 초기화. 되묻기(questions)는 캐시 안 함.

### 검증

- `npm run lint` / `typecheck` / `format:check` / `build` 모두 통과 ✓
- **캐시 A/B(prod 서버, 동일 페이로드 2회)**: 1회차 25.1s(planner+html, 429 자동 복구 포함) → 2회차 **0.006s** `[api/generate] cache hit`, 응답 바디 **byte-identical** ✓ (~4000× 단축)
- **생성 HTML 마커 검증**: NH그린 `#00873c`, `<label>`, `<table>`+`scope/caption`, `<main>/<header>/<nav>` 랜드마크, `aria-label` 모두 실제 출력에 존재 ✓

---

## Phase 7 — 정의서 구조 심화(A1) + 화면 유형 확장(A3) (2026-08-08)

**배경:** 산출물을 실무 설계서로 바로 쓸 수 있게 정의서 스키마를 심화하고, 사내 업무 화면 커버리지를 위해 화면 유형을 확장. 스키마 변경이라 CLAUDE.md 원칙 5대로 5개 지점(types→spec→planner→ruleEngine→templates)을 함께 동기화.

### 변경

- **A1. 정의서 구조 심화** — `DesignSpec`에 선택 필드 5종 추가(모두 optional, 없으면 정의서에서 섹션 생략):
  - `dataFields`(필드명·타입·필수·검증/자릿수·마스킹), `permissions`(역할별 허용 액션), `exceptions`(예외·오류), `integrations`(연계 시스템), `nonFunctional`(비기능 요구). `DataField`/`PermissionRow` 인터페이스 신설.
  - `spec.ts`: 값이 있을 때만 렌더하는 5개 섹션 추가(데이터 필드 명세/권한 매트릭스/예외·오류/연계/비기능).
  - `groqEngine.ts`: planner 프롬프트에 5개 필드 스키마+작성 규칙(억지로 지어내지 말 것) 추가. `coerceSpec`에 방어 헬퍼(`coerceDataFields`/`coercePermissions`/`coerceStringList`/`optional`) — 빈 배열이면 필드 자체를 undefined로 두어 정의서에서 생략.
- **A3. 화면 유형 확장** — `ScreenType`에 `approval`(승인/결재), `wizard`(다단계 마법사), `report`(리포트/출력) 추가(5종→8종):
  - `types.ts`/`groqEngine.SCREEN_TYPES`/`spec.ts TYPE_LABEL` 동기화, planner에 유형 판단 가이드 추가.
  - `templates/approval.ts`·`wizard.ts`·`report.ts` 신설(기존 `wf.*` 프리미티브 재사용, 저충실도 톤 유지). `ruleEngine`의 `TYPE_RULES`(NH 키워드: 승인/결재/반려·마법사/단계별·리포트/집계/실적), `specsByType`(3종 spec, 일부 A1 예시 포함), `BODY_BY_TYPE` 동기화.

### 검증

- `npm run typecheck` / `lint` / `format:check` / `build` 모두 통과 ✓ (`Record<ScreenType,...>`가 8종 전부 커버 강제)
- **규칙 엔진 E2E**(키 없이 폴백): "여신 승인 결재"→`approval`(권한매트릭스·예외 섹션 O, 승인 버튼 O), "월별 여신 실적 집계 리포트"→`report`(데이터 필드 명세 O, 내보내기 O), "대출 신청 다단계 마법사"→`wizard`(진행 단계 O) ✓
- **Groq E2E**(실키): "조합원 대출 승인/반려 결재 화면" → `screenType=approval`, **A1 5개 섹션 전부 렌더**, dataFields 5행·permissions 2행 LLM이 채움, NH그린 O, 429 자동 복구 ✓

---

## Phase 7.1 — 되묻기 질문 다중 선택 (2026-08-08)

**배경:** 되묻기(clarifying questions) 카드가 질문마다 단일 선택만 가능했다. "포함할 항목을 모두 고르세요" 같은 질문은 복수 선택이 자연스러워, 질문별로 단일/복수를 자동 판단하도록 개선.

### 변경 — `types.ts`, `groqEngine.ts`, `app/page.tsx`, `globals.css`

- **`ClarifyingQuestion`에 `multiSelect?: boolean`** 추가(선택, 기본 단일).
- **planner 프롬프트**: 각 질문에 `multiSelect` 지정 안내(여러 개 고르는 게 자연스러운 질문=true, 택1=false). 예시 JSON에 필드 포함. `coerceQuestions`가 `multiSelect === true`만 신뢰(방어).
- **`QuestionCard`**: 선택 상태를 `Record<number,string[]>`로 변경(단일=길이≤1, 복수=여럿). 단일은 라디오식(재클릭 시 해제), 복수는 토글식. 답변 요약은 `A, B` 형태로 합산해 전송.
- **CSS**: 복수 질문에 "복수 선택 가능" 뱃지, 옵션에 체크박스(선택 시 흰 박스+그린 ✓ L자 보더). 단일은 기존 pill 유지.

### 검증

- `typecheck` / `lint` / `format:check` / `build` 모두 통과 ✓
- **API E2E**(실키): 애매한 프롬프트 → Q1~Q3(사용자/목적/화면유형) `multiSelect=false`, Q4("컴포넌트를 모두 선택") `multiSelect=true`로 planner가 정확히 판단 ✓
- **UI 렌더**(헤드리스 크롬): 단일 질문 pill(택1) vs 복수 질문 체크박스+뱃지, 선택 시 그린 ✓ 시각 구분 스크린샷 확인 ✓

---

## Phase 8 — 온보딩(C3) + 버전 되돌리기(A2) (2026-08-08)

**배경:** 로드맵 축 C(C3 온보딩)와 축 A(A2 추적성·버전)를 함께 처리. 저장 구조 변경 없이 기존 대화 이력을 버전으로 활용.

### 변경 — `app/page.tsx`, `app/globals.css`

- **C3. 온보딩** — 초기 인트로를 확장: 숫자 3단계 가이드(요구사항 작성 → 정의서+와이어프레임 확인 → 대화로 다듬기), 💡 프롬프트 작성 팁(사용 주체·목적·필수 항목), "이렇게 시작해 보세요" 예시 칩. 기존 `.hint` 제거.
- **A2. 버전 되돌리기** — 각 `design` turn을 버전으로 취급:
  - `pinnedTurn` 상태 추가. 고정 시 결과 패널·다음 편집 기준(`currentSpec`)이 그 버전을 씀. 새 생성/새 대화/프로젝트 전환 시 자동 해제.
  - 각 design 말풍선에 "버전 N/총" 표기 + "이 버전 보기"/"현재 보는 버전"(비활성) 버튼. 활성 버전 말풍선은 왼쪽 그린 보더.
  - 이전 버전 보는 중엔 결과 상단에 안내 배너 + "최신 버전으로" 링크.

### 검증

- `typecheck` / `lint` / `format:check` / `build` 모두 통과 ✓
- **온보딩 렌더**(헤드리스 크롬): 3단계 가이드·팁 박스·예시 칩 스크린샷 확인 ✓
- **버전 E2E**(CDP로 2버전 주입 후 조작): 라벨 "버전 1/2"·"버전 2/2", 버튼 상태(v1=이 버전 보기 활성, v2=현재 보는 버전 비활성), 기본은 v2 표시 → v1 버튼 클릭 시 배너 노출 + 스펙 패널이 v1으로 전환됨을 실측 확인 ✓

---

## Phase 9 — 응답 스트리밍(SSE) (2026-08-08)

**배경:** 생성 시 30~60초 동안 "생각 중…"만 떠서 체감 지연이 컸다. HTML author 출력을 토큰 단위로 흘려보내 "그려지는 과정"을 실시간으로 보여준다. 기존 비스트리밍 경로는 보존(규칙 엔진·캐시 히트용).

### 변경 — `types.ts`, `groqEngine.ts`, `app/api/generate/route.ts`, `app/page.tsx`, `globals.css`

- **`StreamEvent` 타입** 신설: `status | questions | html(delta) | done | error`. `DesignEngine.generateStream?()`(선택 메서드)로 인터페이스 확장 — 미구현 엔진은 라우트가 자동으로 비스트리밍 폴백.
- **엔진**: `planDesign()`으로 planner+vision 준비 로직을 공통 추출(비스트리밍 `generate`와 공유). `callGroqStream()` — Groq `stream:true` SSE를 파싱해 delta를 yield(스트림 시작 전 429/5xx 재시도, 시작 후 실패는 받은 만큼으로 마감). `generateStream()`이 status→(questions|html*→done) 순으로 방출.
- **API 라우트**: `?stream=1`이고 엔진이 스트리밍 지원 시 `text/event-stream` 응답(`sseResponse`). done/questions 시 캐시에 저장. **캐시 히트는 단일 done 이벤트로 즉시 리플레이**(클라 처리 일원화).
- **클라이언트**: `callEngine`이 SSE를 읽어 status는 로딩 문구로, html delta는 `streamHtml` 누적→결과 패널에 **실시간 와이어프레임 미리보기**("✍️ 실시간으로 그리는 중…" 태그). content-type이 event-stream이 아니면 기존 JSON 폴백. `applyResult()`로 최종 반영.

### 검증 (dev 서버)

- **서버 SSE**(상세 프롬프트): `status`×2("요구사항 분석"→"화면 그리는 중") → `html`×2092(총 7562자 델타) → `done`(spec title/list, NH그린 O) 실측 ✓
- **캐시 히트 리플레이**: 동일 요청 → `done` 단일 이벤트, `cache hit` 로그, **~19ms** ✓
- **브라우저 내 fetch+파싱**(CDP): 실제 Chrome에서 `ReadableStream` SSE 파싱이 status/html/done을 정상 수신 — 클라 `callEngine`과 동일 경로 ✓
- **라이브 미리보기 시각**(하네스): ~55% 시점 부분 HTML이 NH그린 제목+검색조건 카드로 렌더되며 "그리는 중" 태그 노출 스크린샷 확인 ✓
- `typecheck` / `lint` / `format:check` / `build` 모두 통과 ✓

---

## Phase 9.1 — 작은 개선 묶음: 규칙엔진 NH 도메인 + A4 seed + README (2026-08-08)

**배경:** 로드맵 잔여 소소한 항목들을 한 번에 처리.

### 변경

- **규칙엔진 도메인 NH화** (`ruleEngine.ts`) — 소비자용 도메인(쇼핑/소셜/예약/미디어)을 사내 도메인으로 교체: 여신·수신·조합원관리·승인/결재·영업점업무·경영/관리. (키 없을 때 폴백 품질↑)
- **A4 재현성 — seed 고정** (`groqEngine.ts`) — planner·HTML 작성 호출에 `seed: 42` 추가(best-effort). 같은 입력의 run-to-run 편차 감소.
- **README 기술스택 상세화** — 스택 표(프레임워크/의존성/LLM 2모델/스트리밍/저장/스타일/품질도구/런타임/호스팅), 기능 목록, 환경변수 표(모델 오버라이드 포함), 시크릿 커밋 금지 경고. 낡은 표기(Llama 3.3 70B 등) 정정.

### 검증

- `typecheck` / `lint` / `format:check` / `build` 모두 통과 ✓
- **규칙엔진 도메인 E2E**(키 없이): "대출 심사 목록"→여신, "예금 잔액 조회"→수신, "조합원 상담 이력"→조합원관리 실측 ✓

---

## Phase 10 — 자연어 국소 수정(C1, D안) (2026-08-08)

**배경:** "직접 편집"의 원안 후보는 (A) HTML 코드 편집이었으나, **사용자 대부분이 코딩 문외한**이라는 점을 반영해 방향 전환. 코드 0줄로 "이 버튼 빨간색으로", "행 추가" 같은 자연어 지시로 **기존 화면의 일부만** 고치는 방식(D안)으로 결정. UI는 기존 대화창 그대로 — 수정/신규를 자동 판단.

### 변경 — `types.ts`, `cache.ts`, `route.ts`, `groqEngine.ts`, `app/page.tsx`

- **`GenerateRequest.currentHtml`** 추가 — 클라이언트가 현재 와이어프레임 HTML을 함께 전송(수정 시 필요). API에서 60KB 상한 검증, 캐시 키에도 포함.
- **planner에 `mode:"edit"` 판단** — 현재 화면(currentHtml)이 있고 마지막 지시가 국소 변경이면 edit, 유형/목적이 통째로 바뀌면 design. currentHtml 있을 때만 edit 힌트 주입.
- **국소 수정 경로** — `HTML_EDIT_GUIDE`("무관한 부분 한 글자도 바꾸지 마라") + `htmlEditBody()`(현재 HTML+지시 → 최소 수정된 전체 HTML, temperature 0.2, max_tokens는 입력 크기에 맞춰 동적 산정으로 TPM 대응). spec은 기존 것 유지. `generate`·`generateStream` 양쪽에 edit 분기(스트리밍 상태 "요청하신 부분만 수정하고 있어요…").
- 실패 시 원본 HTML로 폴백.

### 검증 (dev 서버, 실키)

- **국소 수정**: "제목 옆에 '신규 계좌 등록' 버튼 추가" → planner가 **edit 경로**, HTML 7849→7917자(+68), 버튼 추가됨, **base 라인 188/188(100%) 보존**, spec/title 유지 ✓
- **신규 화면 오분류 방지**: currentHtml 있는 상태에서 "완전히 다른 결재 화면 새로 만들어" → **design 경로**(edit 아님), title "여신 대출 심사 결재"/screenType approval, base 라인 64/188만 잔존(전체 재생성) ✓
- 서버 로그에 `html-edit` 호출 확인, 429는 재시도로 자동 복구 ✓
- `typecheck` / `lint` / `format:check` / `build` 모두 통과 ✓

> 참고: 코드 직접 편집(A안)은 코딩 문외한 사용자에 부적합하다는 판단으로 채택하지 않음. 국소 수정 정확도는 LLM 의존이라 드물게 무관한 부분이 바뀔 수 있어, 실패 시 버전 되돌리기(A2)로 복구 가능.

---

## Phase 11 — 서버 DB(SQLite) + 자체 회원/인증 (2026-08-09)

**배경:** 저장이 100% localStorage라 기기 바뀌면 유실, 사용자 구분 없음. 알파테스트 수준으로 **자체 ID/PW 회원 + 계정별 서버 영속**을 도입(보고서 관문 B4 영속화 + B1 인증의 알파 버전). 정식 출시·심의 전제 아님.

### 결정

- DB: **`node:sqlite`(Node 22+ 내장, 의존성 0)**. 로컬 Node v24 동작 실측. `better-sqlite3` 대신 선택(의존성 지양). 문제 시 `lib/db.ts` 한 파일만 교체하면 됨.
- 인증: 내장 `crypto.scrypt` 해싱 + **DB 세션 테이블 + httpOnly 쿠키**(JWT 아님 — 로그아웃 무효화 단순). 임의 아이디(3~40자).
- turns는 정규화 없이 `turns_json` blob 저장(스키마 불변).

### 변경

- **신규** `lib/db.ts`(node:sqlite 싱글턴, WAL·FK·busy_timeout, `CREATE TABLE IF NOT EXISTS` users/sessions/projects, globalThis 캐싱), `lib/auth.ts`(hashPassword/verifyPassword, 세션 CRUD, getSessionUser), `lib/projects.ts`(계정 스코프 CRUD + 서버측 turns 트리밍).
- **신규 route** `app/api/auth/{register,login,logout,me}`, `app/api/projects/route.ts`(GET 목록)·`[id]/route.ts`(GET/PUT/DELETE). 전부 `getSessionUser` + SQL `WHERE user_id`로 소유권 강제. DB/쿠키 접근 route에 `export const dynamic='force-dynamic'`(빌드 정적수집 방지 — "database is locked" 해결).
- **신규** `components/AuthGate.tsx`(로그인/회원가입 폼).
- **수정** `app/page.tsx`: localStorage 계층 제거 → 부팅 시 `/api/auth/me`로 게이트, `/api/projects` 로드, turns 변경 시 디바운스(600ms) `PUT` 저장, 프로젝트 상세 lazy fetch, 삭제 API, 로그아웃, 헤더 사용자칩. 401 시 AuthGate 복귀.
- **수정** `.gitignore`(data/), `package.json`(engines.node≥22.5, @types/node 22 — node:sqlite 타입), `.env.local.example`/README/CLAUDE.md 문서.
- **미변경**: 엔진·캐시·생성 로직, `/api/generate`(인증 미부착 — 과설계 금지).

### 검증

- `typecheck` / `lint` / `build`(7개 route 등록) 통과 ✓
- **서버 curl E2E**(격리 DB): 가입(200+쿠키)→me→PUT 저장→목록→상세 복원→**타계정 접근 404**(소유권)→미로그인 401→중복가입 409→로그아웃 후 me=null 전부 통과 ✓
- **브라우저 E2E**(CDP, 실키): AuthGate 노출→회원가입→헤더 사용자칩→화면 생성(자동 저장)→로그아웃→**재로그인 시 프로젝트/정의서 복원**, "프로젝트 (1)" ✓
- **재시작 durability**: 서버 종료 후 같은 DB로 재기동 → 계정 로그인·프로젝트 유지 확인(파일 영속) ✓

> 리스크: Render 무료 디스크 휘발성(재배포 시 초기화, 알파 수용 — `DATABASE_PATH`로 Persistent Disk 전환 가능). node:sqlite 실험적 API. 보안은 알파 수준(정식엔 SSO·rate limit·감사 별도).
