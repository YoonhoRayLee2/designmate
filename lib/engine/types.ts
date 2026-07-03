export type ScreenType = 'list' | 'detail' | 'form' | 'dashboard' | 'auth';

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

export interface DesignSpec {
  title: string;
  screenType: ScreenType;
  domain: string;
  summary: string;
  screens: ScreenDef[];
  components: ComponentDef[];
  userFlow: string[];
  designNotes: string[];
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
}

/** Engine either produces a design, or asks clarifying questions first. */
export type EngineOutput =
  | ({ mode: 'design' } & GenerateResult)
  | { mode: 'questions'; questions: ClarifyingQuestion[] };

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
}

export interface DesignEngine {
  generate(req: GenerateRequest): Promise<EngineOutput>;
}
