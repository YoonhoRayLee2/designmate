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
- Next.js 보안 패치 업그레이드(별도 검증 필요)
- 컴포넌트 분리 리팩토링, 다중 프로젝트 히스토리(DB), 스트리밍(SSE)
