# DesignMate

자연어 요구사항을 입력하면 **UI/UX 정의서**와 **와이어프레임(HTML/CSS 목업)** 을 생성해 주는 웹앱.

- 좌측: 화면 구성 · 컴포넌트 · 사용자 플로우 · 디자인 노트가 담긴 정의서
- 우측: 실제 렌더링되는 저충실도 와이어프레임 (iframe)

엔진은 두 가지:
- **Groq (LLM)** — `GROQ_API_KEY`가 있으면 Groq(Llama 3.3 70B)가 프롬프트를 이해해 정의서+와이어프레임을 직접 생성. 무료 티어: https://console.groq.com
- **규칙 기반 폴백** — 키가 없으면 키워드로 화면 유형을 판별해 템플릿 목업 생성.

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
  page.tsx                 # 입력창 + 정의서/와이어프레임 2분할 뷰
  api/generate/route.ts    # POST { prompt } → { spec, wireframeHtml, specMarkdown }
lib/
  engine/
    index.ts               # getEngine() — GROQ_API_KEY 있으면 Groq, 없으면 규칙 엔진
    groqEngine.ts          # Groq(OpenAI 호환) 호출 → JSON spec+html
    ruleEngine.ts          # 오프라인 폴백
  templates/               # 규칙 엔진용 화면 유형별 HTML/CSS 목업 생성기
  spec.ts                  # DesignSpec → 정의서 마크다운
  markdown.ts              # 정의서 마크다운 → HTML (경량 렌더러)
components/                # SpecPanel, WireframePreview (입력은 page.tsx 내장)
```

## Render 배포 시 환경변수

Render 대시보드에 `GROQ_API_KEY`를 추가하세요. (선택: `GROQ_MODEL`)
키가 없으면 자동으로 규칙 엔진으로 동작합니다.

## 다른 LLM으로 교체하기

`lib/engine/index.ts`의 `getEngine()` 한 곳만 바꾸면 됩니다.
새 엔진은 동일한 `DesignEngine` 인터페이스(`generate(prompt) → { spec, wireframeHtml, specMarkdown }`)를 구현하면 됩니다.
