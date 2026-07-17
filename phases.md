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
