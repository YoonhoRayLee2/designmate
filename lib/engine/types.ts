export type ScreenType =
  | 'list'
  | 'detail'
  | 'form'
  | 'dashboard'
  | 'auth'
  | 'approval' // 승인/결재 워크플로우
  | 'wizard' // 다단계 마법사
  | 'report'; // 리포트/출력

export interface ScreenDef {
  name: string;
  purpose: string;
  components: string[];
}

export interface ComponentDef {
  name: string;
  description: string;
  states?: string[];
}

/** 데이터 필드 명세 한 행 (A1). */
export interface DataField {
  name: string; // 필드명 (예: 조합원번호)
  type: string; // 타입 (예: 문자열, 숫자, 날짜, 코드)
  required: boolean; // 필수 여부
  rule?: string; // 검증 규칙/자릿수 (예: 13자리, YYYY-MM-DD)
  masking?: string; // 마스킹 규칙 (예: 뒤 4자리만 표시)
}

/** 역할별 권한 매트릭스 한 행 (A1). */
export interface PermissionRow {
  role: string; // 역할 (예: 영업점 직원, 지점장, 본부 담당자)
  actions: string; // 허용 액션 (예: 조회/등록/수정, 승인)
}

export interface DesignSpec {
  title: string;
  screenType: ScreenType;
  domain: string;
  summary: string;
  screens: ScreenDef[];
  components: ComponentDef[];
  userFlow: string[];
  designNotes: string[];
  // --- A1: 실무 설계서용 심화 항목 (모두 선택 — 없으면 정의서에서 섹션 생략) ---
  /** 데이터 필드 명세 (타입·필수·검증·마스킹) */
  dataFields?: DataField[];
  /** 권한/역할 매트릭스 */
  permissions?: PermissionRow[];
  /** 예외·오류 케이스 */
  exceptions?: string[];
  /** 연계 시스템 (API/전문/타 시스템) */
  integrations?: string[];
  /** 비기능 요구 (성능·보안·감사 등) */
  nonFunctional?: string[];
}

export interface GenerateResult {
  spec: DesignSpec;
  /** Full standalone HTML document (with inline <style>) for the wireframe mockup. */
  wireframeHtml: string;
  /** Rendered UI/UX specification as markdown. */
  specMarkdown: string;
}

/** One clarifying question the engine asks before it can design well. */
export interface ClarifyingQuestion {
  question: string;
  options: string[];
  /** When true, the user may pick multiple options (default: single choice). */
  multiSelect?: boolean;
}

/** Engine either produces a design, or asks clarifying questions first. */
export type EngineOutput =
  ({ mode: 'design' } & GenerateResult) | { mode: 'questions'; questions: ClarifyingQuestion[] };

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Reference images as base64 data URLs (user messages only). */
  images?: string[];
}

export interface GenerateRequest {
  /** Full conversation so far; the last user message is the current instruction. */
  messages: ChatMessage[];
  /** The spec currently on screen, if this is a refinement of an existing design. */
  currentSpec?: DesignSpec;
  /**
   * The wireframe HTML currently on screen (Phase 10). When present with a
   * localized edit request, the engine minimally edits this HTML instead of
   * regenerating the whole screen from the spec.
   */
  currentHtml?: string;
}

/**
 * Streaming events emitted while a design is produced (Phase 9).
 * - status: a human-facing progress line (planner running, drawing, …)
 * - questions: the engine chose to ask instead of design (terminal)
 * - html: an incremental chunk of the wireframe HTML as it's authored
 * - done: the finished result (terminal)
 * - error: a user-facing failure message (terminal)
 */
export type StreamEvent =
  | { type: 'status'; message: string }
  | { type: 'questions'; questions: ClarifyingQuestion[] }
  | { type: 'html'; delta: string }
  | { type: 'done'; result: GenerateResult }
  | { type: 'error'; message: string };

export interface DesignEngine {
  generate(req: GenerateRequest): Promise<EngineOutput>;
  /** Optional streaming variant. When absent, the route falls back to generate(). */
  generateStream?(req: GenerateRequest): AsyncGenerator<StreamEvent>;
}
