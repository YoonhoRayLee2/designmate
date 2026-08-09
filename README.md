# DesignMate

NH농협 사내 화면 설계 도우미. 자연어 요구사항을 대화로 다듬어 **UI/UX 정의서**와 **와이어프레임(HTML/CSS 목업)** 을 생성한다.

- 좌측: 화면 구성 · 컴포넌트 · 사용자 플로우 · 디자인 노트에 더해 **데이터 필드 명세 · 권한 매트릭스 · 예외/오류 · 연계 시스템 · 비기능 요구**까지 담긴 실무형 정의서
- 우측: 실제 렌더링되는 와이어프레임 (iframe, 클릭 무력화된 정적 목업)

주요 기능: 대화형 반복 개선(되묻기·다중 선택 포함), 레퍼런스 이미지 첨부, 8종 화면 유형(list/detail/form/dashboard/auth/approval/wizard/report), **회원가입·로그인(계정별 서버 저장)**, 다중 프로젝트 히스토리, 버전 되돌리기, **응답 스트리밍(생성 과정 실시간 표시)**, MD/HTML 내보내기.

## 회원·저장 (알파)

- **자체 ID/PW 회원**(가입/로그인/로그아웃). 비밀번호는 Node 내장 `crypto.scrypt`로 해싱, 세션은 DB 토큰 + httpOnly 쿠키.
- 프로젝트/대화는 **로그인한 계정별로 서버 SQLite에 저장** → 기기·브라우저가 바뀌어도 복원. (이전 localStorage 저장은 제거됨.)
- DB: Node 내장 `node:sqlite`(의존성 0, Node 22+). 파일 위치는 `DATABASE_PATH`(기본 `./data/designmate.db`).
- ⚠️ **Render 무료 티어 디스크는 휘발성**이라 재배포/재시작 시 계정·프로젝트가 초기화된다(알파 테스트 수용). 영속이 필요하면 Persistent Disk를 마운트하고 `DATABASE_PATH`를 그 경로로 지정(코드 변경 불필요).
- 알파 수준 보안이며 정식 출시엔 사내 SSO·rate limit·HTTPS 강제·감사가 별도로 필요.

## 기술 스택

| 구분                | 내용                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------- |
| 프레임워크          | **Next.js 14 (App Router) + TypeScript**, React 18                                     |
| 의존성              | `next` / `react` / `react-dom`만 — UI·상태관리·마크다운 라이브러리 없음(의존성 최소화) |
| LLM                 | **Groq** (OpenAI 호환 API). 무료 티어: https://console.groq.com                        |
| ├ 플래너·HTML 작성  | `openai/gpt-oss-120b` (텍스트 전용, JSON 모드로 판단+spec / 텍스트로 HTML)             |
| └ 비전(이미지 분석) | `qwen/qwen3.6-27b` (첨부 레퍼런스 이미지를 텍스트로 서술)                              |
| 스트리밍            | 서버 SSE(`text/event-stream`) → 클라이언트 `ReadableStream` 파싱                       |
| 저장                | 브라우저 `localStorage` (다중 프로젝트, 서버 DB 없음)                                  |
| 스타일              | 순수 CSS(`globals.css`, NH 딥그린 #00873c 토큰). 와이어프레임은 iframe `srcDoc`로 격리 |
| 품질 도구           | ESLint(next/core-web-vitals) · Prettier · `tsc --noEmit`                               |
| 런타임              | Node.js ≥ 18.18                                                                        |
| 호스팅              | Render (Web Service)                                                                   |

엔진은 두 가지이며 `lib/engine/index.ts`의 `getEngine()` 한 곳에서 선택된다:

- **Groq (LLM)** — `GROQ_API_KEY`가 있으면 프롬프트를 이해해 정의서+와이어프레임을 직접 생성.
- **규칙 기반 폴백** — 키가 없으면 키워드로 화면 유형·NH 도메인을 판별해 템플릿 목업 생성.

## 로컬 실행

```bash
cd designmate-app
npm install
cp .env.local.example .env.local   # GROQ_API_KEY 채우기 (없으면 규칙 엔진으로 동작)
npm run dev
# http://localhost:3000
```

## 프로덕션 빌드

```bash
npm run build
npm start   # PORT 환경변수 자동 사용
```

## Render 배포

- **Type:** Web Service / **Environment:** Node
- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm start`
- Next.js가 Render의 `PORT` 환경변수를 자동으로 사용하므로 추가 설정 불필요.

## 구조

```
app/
  page.tsx                 # 로그인 게이트 + 입력창 + 정의서/와이어프레임 2분할 뷰
  api/generate/route.ts    # POST { messages } → { spec, wireframeHtml, specMarkdown } (SSE 지원)
  api/auth/                # register / login / logout / me (자체 ID/PW 세션)
  api/projects/            # GET 목록 / [id] GET·PUT·DELETE (계정별 소유권)
lib/
  db.ts                    # node:sqlite 싱글턴 + 스키마 부트스트랩
  auth.ts                  # scrypt 해싱 + DB 세션 + getSessionUser
  projects.ts              # 계정 스코프 프로젝트 CRUD (turns는 JSON blob)
  engine/
    index.ts               # getEngine() — GROQ_API_KEY 있으면 Groq, 없으면 규칙 엔진
    groqEngine.ts          # Groq(OpenAI 호환) 호출 → spec + html (스트리밍/국소수정)
    ruleEngine.ts          # 오프라인 폴백
  templates/               # 규칙 엔진용 화면 유형별 HTML/CSS 목업 생성기
  spec.ts                  # DesignSpec → 정의서 마크다운
  markdown.ts              # 정의서 마크다운 → HTML (경량 렌더러)
components/                # SpecPanel, WireframePreview, AuthGate
data/                      # (gitignore) SQLite 파일
```

## 환경변수

`.env.local` (로컬) 또는 Render 대시보드에 설정한다. 키가 없으면 자동으로 규칙 엔진으로 폴백한다.

| 변수                | 필수 | 기본값                 | 설명                  |
| ------------------- | ---- | ---------------------- | --------------------- |
| `GROQ_API_KEY`      | 권장 | —                      | 없으면 규칙 엔진 폴백 |
| `GROQ_HTML_MODEL`   | 선택 | `openai/gpt-oss-120b`  | 플래너·HTML 작성 모델 |
| `GROQ_VISION_MODEL` | 선택 | `qwen/qwen3.6-27b`     | 이미지 분석 모델      |
| `DATABASE_PATH`     | 선택 | `./data/designmate.db` | SQLite 파일 경로      |

> ⚠️ `.env.local`과 `data/`는 gitignore 대상 — API 키·DB 파일을 커밋하지 말 것.
> Node 22+ 필요(`node:sqlite` 내장 모듈 사용).

## 다른 LLM으로 교체하기

`lib/engine/index.ts`의 `getEngine()` 한 곳만 바꾸면 됩니다.
새 엔진은 동일한 `DesignEngine` 인터페이스(`generate(prompt) → { spec, wireframeHtml, specMarkdown }`)를 구현하면 됩니다.
