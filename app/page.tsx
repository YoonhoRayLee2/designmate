'use client';

import { useEffect, useRef, useState } from 'react';
import SpecPanel from '@/components/SpecPanel';
import WireframePreview from '@/components/WireframePreview';
import type { ChatMessage, ClarifyingQuestion, EngineOutput, GenerateResult, StreamEvent } from '@/lib/engine/types';

const STORAGE_KEY = 'designmate.projects.v1';
const LEGACY_KEY = 'designmate.session.v2';
const MAX_STORED_TURNS = 40;
const MAX_PROJECTS = 30;

const EXAMPLES = [
  '조합원 대출 신청 화면',
  '영업점 직원용 고객 상담 이력 조회',
  '본부 관리자용 승인 대기 업무 대시보드',
  '농산물 시세 조회 목록',
];

type Turn =
  | { kind: 'user'; content: string; images?: string[] }
  | { kind: 'design'; result: GenerateResult }
  | { kind: 'questions'; questions: ClarifyingQuestion[]; answered?: boolean };

const MAX_IMAGES = 5;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface Project {
  id: string;
  title: string;
  turns: Turn[];
  updatedAt: number;
}

interface Store {
  projects: Project[];
  activeId: string | null;
}

// Simple id, collision-safe enough for a single browser's local storage.
function newId(): string {
  return `p_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/** Derive a project title from its first generated design, else a placeholder. */
function deriveProjectTitle(turns: Turn[]): string {
  const firstDesign = turns.find((t): t is Extract<Turn, { kind: 'design' }> => t.kind === 'design');
  return firstDesign?.result.spec.title?.trim() || '새 프로젝트';
}

function loadStore(): Store {
  if (typeof window === 'undefined') return { projects: [], activeId: null };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Store;
    // Migrate a legacy single session into the first project.
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const { turns } = JSON.parse(legacy) as { turns: Turn[] };
      if (turns?.length) {
        const p: Project = { id: newId(), title: deriveProjectTitle(turns), turns, updatedAt: Date.now() };
        return { projects: [p], activeId: p.id };
      }
    }
  } catch {
    /* ignore corrupt storage */
  }
  return { projects: [], activeId: null };
}

/** Drop base64 images before persisting — they blow past the localStorage quota. */
function turnForStorage(t: Turn): Turn {
  if (t.kind === 'user' && t.images) {
    const { images, ...rest } = t;
    void images;
    return rest;
  }
  return t;
}

/** Persist the whole store, trimming turns/projects if the quota is exceeded. */
function persistStore(store: Store) {
  let projects = store.projects.slice(0, MAX_PROJECTS).map((p) => ({
    ...p,
    turns: p.turns.slice(-MAX_STORED_TURNS).map(turnForStorage),
  }));
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ projects, activeId: store.activeId }));
      return;
    } catch {
      // Shed the oldest project first; if only the active one remains, trim its turns.
      if (projects.length > 1) {
        projects = projects.slice(0, -1);
      } else if (projects[0] && projects[0].turns.length > 2) {
        projects = [{ ...projects[0], turns: projects[0].turns.slice(Math.ceil(projects[0].turns.length / 2)) }];
      } else {
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          /* give up silently */
        }
        return;
      }
    }
  }
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Home() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  // Phase 9: live streaming state — status line + partial HTML as it's authored.
  const [streamStatus, setStreamStatus] = useState('');
  const [streamHtml, setStreamHtml] = useState('');
  const [error, setError] = useState('');
  const [lastFailed, setLastFailed] = useState<ChatMessage | null>(null);
  const [copied, setCopied] = useState('');
  // Mobile-only: which panel is shown (desktop always shows both side by side).
  const [mobileView, setMobileView] = useState<'chat' | 'result'>('chat');
  // Multi-project history.
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // A2: when the user pins an earlier version, the result panel shows that turn
  // instead of the latest. Cleared on any new generation. Stored as a turn index.
  const [pinnedTurn, setPinnedTurn] = useState<number | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const hydrated = useRef(false);

  // Load projects on mount; open the most recent (or start empty).
  useEffect(() => {
    const store = loadStore();
    setProjects(store.projects);
    const active = store.projects.find((p) => p.id === store.activeId) ?? store.projects[0] ?? null;
    if (active) {
      setActiveId(active.id);
      setTurns(active.turns);
    }
    hydrated.current = true;
  }, []);

  // Persist whenever turns change: fold current turns into the active project.
  useEffect(() => {
    if (!hydrated.current) return;
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });

    setProjects((prev) => {
      let id = activeId;
      let next: Project[];
      if (!id) {
        // No active project yet: create one once the user has any turns.
        if (!turns.length) return prev;
        id = newId();
        next = [{ id, title: deriveProjectTitle(turns), turns, updatedAt: Date.now() }, ...prev];
        setActiveId(id);
      } else {
        next = prev.map((p) =>
          p.id === id ? { ...p, turns, title: deriveProjectTitle(turns), updatedAt: Date.now() } : p,
        );
      }
      persistStore({ projects: next, activeId: id });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turns]);

  // All design turns with their turn index, in order — these are the "versions".
  const designTurns = turns
    .map((t, i) => (t.kind === 'design' ? { i, result: t.result } : null))
    .filter((x): x is { i: number; result: GenerateResult } => x !== null);

  // The result on screen: the pinned version if any (A2), else the newest design.
  const activeDesign =
    (pinnedTurn !== null && designTurns.find((d) => d.i === pinnedTurn)) || designTurns[designTurns.length - 1] || null;
  const latestResult = activeDesign?.result;

  // Build the conversation history to send to the engine from the turn list.
  // Past images are dropped from history (kept only on the current message)
  // to avoid resending large payloads every turn.
  function buildHistory(extra: ChatMessage[]): ChatMessage[] {
    const history: ChatMessage[] = [];
    for (const t of turns) {
      if (t.kind === 'user') history.push({ role: 'user', content: t.content });
      else if (t.kind === 'design')
        history.push({ role: 'assistant', content: `[생성됨] ${t.result.spec.title} (${t.result.spec.screenType})` });
      else if (t.kind === 'questions')
        history.push({ role: 'assistant', content: `[질문함] ${t.questions.map((q) => q.question).join(' / ')}` });
    }
    return [...history, ...extra];
  }

  async function callEngine(userMessage: ChatMessage) {
    setError('');
    setLastFailed(null);
    setLoading(true);
    setStreamStatus('생각 중…');
    setStreamHtml('');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch('/api/generate?stream=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: buildHistory([userMessage]),
          currentSpec: latestResult?.spec,
          currentHtml: latestResult?.wireframeHtml,
        }),
        signal: controller.signal,
      });

      // Non-streaming fallback (e.g. rule engine, or a JSON error response).
      const contentType = res.headers.get('content-type') ?? '';
      if (!res.ok || !res.body || !contentType.includes('text/event-stream')) {
        const data = (await res.json()) as EngineOutput | { error: string };
        if (!res.ok || 'error' in data) throw new Error(('error' in data && data.error) || '생성에 실패했습니다.');
        applyResult(data);
        return;
      }

      // Parse the SSE stream: `data: {json}\n\n` events.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let streamError = '';
      let gotResult = false;
      let partial = '';

      readLoop: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          const line = part.split('\n').find((l) => l.startsWith('data:'));
          if (!line) continue;
          const ev = JSON.parse(line.slice(5).trim()) as StreamEvent;
          if (ev.type === 'status') {
            setStreamStatus(ev.message);
          } else if (ev.type === 'html') {
            partial += ev.delta;
            setStreamHtml(partial);
            setMobileView('result'); // reveal the drawing as it happens (mobile)
          } else if (ev.type === 'questions') {
            setTurns((prev) => [...prev, { kind: 'questions', questions: ev.questions }]);
            gotResult = true;
            break readLoop;
          } else if (ev.type === 'done') {
            applyResult({ mode: 'design', ...ev.result });
            gotResult = true;
            break readLoop;
          } else if (ev.type === 'error') {
            streamError = ev.message;
            break readLoop;
          }
        }
      }

      if (streamError) throw new Error(streamError);
      if (!gotResult) throw new Error('생성이 완료되지 않았습니다. 다시 시도해 주세요.');
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setError(''); // user-initiated cancel: no error banner
      } else {
        setError(e instanceof Error ? e.message : '오류가 발생했습니다.');
        setLastFailed(userMessage); // enable retry
      }
    } finally {
      setLoading(false);
      setStreamStatus('');
      setStreamHtml('');
      abortRef.current = null;
    }
  }

  // Apply a finished EngineOutput to the turn list.
  function applyResult(data: EngineOutput) {
    if (data.mode === 'questions') {
      setTurns((prev) => [...prev, { kind: 'questions', questions: data.questions }]);
    } else {
      setTurns((prev) => [...prev, { kind: 'design', result: data }]);
      setPinnedTurn(null); // a new version supersedes any pinned older one
      setMobileView('result'); // on mobile, jump to the freshly generated screen
    }
  }

  function cancel() {
    abortRef.current?.abort();
  }

  function retry() {
    if (lastFailed) callEngine(lastFailed);
  }

  function sendText(text: string) {
    const value = text.trim();
    const images = pendingImages;
    if ((!value && !images.length) || loading) return;
    const content = value || '첨부한 레퍼런스 이미지를 참고해 화면을 만들어줘.';
    setInput('');
    setPendingImages([]);
    setTurns((prev) => [...prev, { kind: 'user', content, images: images.length ? images : undefined }]);
    callEngine({ role: 'user', content, ...(images.length ? { images } : {}) });
  }

  async function addImages(files: FileList | null) {
    if (!files || !files.length) return;
    const room = MAX_IMAGES - pendingImages.length;
    const picked = Array.from(files)
      .filter((f) => f.type.startsWith('image/'))
      .slice(0, room);
    const urls = await Promise.all(picked.map(fileToDataUrl));
    setPendingImages((prev) => [...prev, ...urls].slice(0, MAX_IMAGES));
    if (fileRef.current) fileRef.current.value = '';
  }

  function removeImage(idx: number) {
    setPendingImages((prev) => prev.filter((_, i) => i !== idx));
  }

  // User answered a clarifying-question card: mark it answered, then send answers.
  function submitAnswers(turnIndex: number, answers: { question: string; answer: string }[]) {
    if (loading) return;
    setTurns((prev) => prev.map((t, i) => (i === turnIndex && t.kind === 'questions' ? { ...t, answered: true } : t)));
    const summary = answers.map((a) => `- ${a.question} → ${a.answer}`).join('\n');
    const content = `아래 조건으로 화면을 만들어줘:\n${summary}`;
    setTurns((prev) => [...prev, { kind: 'user', content }]);
    callEngine({ role: 'user', content });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    sendText(input);
  }
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      sendText(input);
    }
  }
  // Start a fresh project (current one stays saved in the drawer).
  function newProject() {
    setActiveId(null);
    setTurns([]);
    setError('');
    setLastFailed(null);
    setInput('');
    setPendingImages([]);
    setPinnedTurn(null);
    setMobileView('chat');
    setDrawerOpen(false);
  }

  function switchProject(id: string) {
    const p = projects.find((x) => x.id === id);
    if (!p) return;
    setActiveId(id);
    setTurns(p.turns);
    setError('');
    setLastFailed(null);
    setInput('');
    setPendingImages([]);
    setPinnedTurn(null);
    setMobileView(p.turns.some((t) => t.kind === 'design') ? 'result' : 'chat');
    setDrawerOpen(false);
  }

  function deleteProject(id: string) {
    if (!confirm('이 프로젝트를 삭제할까요?')) return;
    setProjects((prev) => {
      const next = prev.filter((p) => p.id !== id);
      const nextActive = id === activeId ? (next[0]?.id ?? null) : activeId;
      persistStore({ projects: next, activeId: nextActive });
      if (id === activeId) {
        setActiveId(nextActive);
        setTurns(next[0]?.turns ?? []);
      }
      return next;
    });
  }

  function copy(text: string, label: string) {
    navigator.clipboard?.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 1500);
  }

  const started = turns.length > 0;

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <button
            className="brand-mark brand-mark-btn"
            onClick={() => setDrawerOpen(true)}
            aria-label="프로젝트 목록 열기"
            title="프로젝트 목록"
          >
            NH
          </button>
          <div>
            <h1>DesignMate</h1>
            <p>NH농협 사내 화면 설계 도우미 · 요구사항을 대화로 다듬어 정의서와 와이어프레임을 만듭니다.</p>
          </div>
        </div>
        <div className="head-actions">
          <button className="btn-ghost" onClick={() => setDrawerOpen(true)}>
            ☰ 프로젝트{projects.length ? ` (${projects.length})` : ''}
          </button>
          <button className="btn-ghost" onClick={newProject}>
            + 새 대화
          </button>
        </div>
      </header>

      {drawerOpen && (
        <>
          <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />
          <aside className="drawer" role="dialog" aria-label="프로젝트 목록">
            <div className="drawer-head">
              <h2>프로젝트</h2>
              <button className="btn-ghost" onClick={() => setDrawerOpen(false)} aria-label="닫기">
                ✕
              </button>
            </div>
            <button className="drawer-new" onClick={newProject}>
              + 새 대화 시작
            </button>
            <div className="drawer-list">
              {projects.length === 0 && <div className="drawer-empty">아직 저장된 프로젝트가 없어요.</div>}
              {projects.map((p) => (
                <div key={p.id} className={`drawer-item ${p.id === activeId ? 'active' : ''}`}>
                  <button className="drawer-item-main" onClick={() => switchProject(p.id)}>
                    <span className="drawer-item-title">{p.title}</span>
                    <span className="drawer-item-time">{new Date(p.updatedAt).toLocaleString('ko-KR')}</span>
                  </button>
                  <button className="drawer-item-del" onClick={() => deleteProject(p.id)} aria-label="삭제">
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </aside>
        </>
      )}

      {/* Mobile-only segmented toggle: choose which panel fills the screen. */}
      <div className="mobile-tabs" role="tablist" aria-label="화면 전환">
        <button
          role="tab"
          aria-selected={mobileView === 'chat'}
          className={`mobile-tab ${mobileView === 'chat' ? 'on' : ''}`}
          onClick={() => setMobileView('chat')}
        >
          대화
        </button>
        <button
          role="tab"
          aria-selected={mobileView === 'result'}
          className={`mobile-tab ${mobileView === 'result' ? 'on' : ''}`}
          onClick={() => setMobileView('result')}
          disabled={!latestResult}
        >
          결과
        </button>
      </div>

      <div className={`results mobile-${mobileView}`}>
        <section className="panel chat-panel">
          <div className="panel-head">
            <h2>대화</h2>
          </div>
          <div className="panel-body chat-thread" ref={threadRef}>
            {!started && (
              <div className="chat-intro">
                <p className="intro-lead">어떤 화면이 필요하신가요? 만들고 싶은 업무 화면을 설명해 주세요.</p>

                <ol className="intro-steps">
                  <li>
                    <span className="step-no">1</span>
                    <span>
                      <strong>요구사항을 적어요.</strong> 예시처럼 한 줄이면 충분하고, 정보가 부족하면 제가 먼저 몇
                      가지를 여쭤봐요.
                    </span>
                  </li>
                  <li>
                    <span className="step-no">2</span>
                    <span>
                      <strong>정의서 + 와이어프레임</strong>이 오른쪽에 함께 나와요. (📎로 참고 이미지를 첨부하면 그
                      느낌을 반영합니다.)
                    </span>
                  </li>
                  <li>
                    <span className="step-no">3</span>
                    <span>
                      <strong>이어서 대화로 다듬어요.</strong> “지점 필터 추가”, “승인 버튼 넣어줘”처럼 계속 요청하면
                      누적 반영되고, 이전 버전으로 되돌릴 수도 있어요.
                    </span>
                  </li>
                </ol>

                <p className="intro-tip">
                  💡 <strong>팁:</strong> 사용 주체(영업점 직원/조합원 등), 목적, 꼭 필요한 항목을 함께 적으면 훨씬
                  정확해요.
                </p>

                <p className="chips-label">이렇게 시작해 보세요</p>
                <div className="chips">
                  {EXAMPLES.map((ex) => (
                    <button key={ex} type="button" className="chip" onClick={() => sendText(ex)}>
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {turns.map((t, i) => {
              if (t.kind === 'user')
                return (
                  <div key={i} className="bubble user">
                    {t.images && t.images.length > 0 && (
                      <div className="bubble-imgs">
                        {t.images.map((src, j) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={j} src={src} alt="첨부" />
                        ))}
                      </div>
                    )}
                    {t.content}
                  </div>
                );
              if (t.kind === 'design') {
                // Version number of this design among all design turns (1-based).
                const versionNo = designTurns.findIndex((d) => d.i === i) + 1;
                const isActive = activeDesign?.i === i;
                const isMultiVersion = designTurns.length > 1;
                return (
                  <div key={i} className={`bubble bot ${isActive ? 'active-version' : ''}`}>
                    <strong>{t.result.spec.title}</strong> 화면을 만들었어요.
                    <span className="meta">
                      {t.result.spec.screenType} · {t.result.spec.domain}
                      {isMultiVersion && ` · 버전 ${versionNo}/${designTurns.length}`}
                    </span>
                    {isMultiVersion && (
                      <button
                        type="button"
                        className="inline-link version-btn"
                        disabled={loading || isActive}
                        onClick={() => {
                          setPinnedTurn(i);
                          setMobileView('result');
                        }}
                      >
                        {isActive ? '현재 보는 버전' : '이 버전 보기'}
                      </button>
                    )}
                  </div>
                );
              }
              return (
                <QuestionCard
                  key={i}
                  questions={t.questions}
                  disabled={loading || !!t.answered}
                  onSubmit={(answers) => submitAnswers(i, answers)}
                />
              );
            })}

            {loading && (
              <div className="bubble bot loading" role="status" aria-live="polite">
                {streamStatus || '생각 중…'}
                <button type="button" className="inline-link" onClick={cancel}>
                  취소
                </button>
              </div>
            )}
            {error && (
              <div className="error" role="alert">
                {error}
                {lastFailed && (
                  <button type="button" className="inline-link" onClick={retry} disabled={loading}>
                    다시 시도
                  </button>
                )}
              </div>
            )}
          </div>

          {pendingImages.length > 0 && (
            <div className="attach-tray">
              {pendingImages.map((src, i) => (
                <div key={i} className="attach-thumb">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="첨부 미리보기" />
                  <button type="button" onClick={() => removeImage(i)} aria-label="제거">
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <form className="chat-form" onSubmit={onSubmit}>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => addImages(e.target.files)}
            />
            <button
              type="button"
              className="attach-btn"
              onClick={() => fileRef.current?.click()}
              disabled={loading || pendingImages.length >= MAX_IMAGES}
              title="레퍼런스 이미지 첨부"
              aria-label="레퍼런스 이미지 첨부"
            >
              📎
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              aria-label="요구사항 입력"
              placeholder={
                started
                  ? '수정/추가 요청을 입력하세요 (⌘/Ctrl + Enter)'
                  : '예: 조합원 대출 신청 화면 만들어줘 (⌘/Ctrl + Enter)'
              }
            />
            <button className="btn" type="submit" disabled={loading}>
              {loading ? '…' : '보내기'}
            </button>
          </form>
        </section>

        <section className="panel result-panel">
          <div className="panel-head">
            <h2>정의서 &amp; 와이어프레임</h2>
            {latestResult && (
              <div className="head-actions">
                {copied && <span className="copied-toast">{copied} 복사됨</span>}
                <button className="btn-ghost" onClick={() => copy(latestResult.specMarkdown, '정의서')}>
                  정의서 복사
                </button>
                <button className="btn-ghost" onClick={() => copy(latestResult.wireframeHtml, 'HTML')}>
                  HTML 복사
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => download('designmate-정의서.md', latestResult.specMarkdown, 'text/markdown')}
                >
                  정의서 ↓
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => download('designmate-wireframe.html', latestResult.wireframeHtml, 'text/html')}
                >
                  HTML ↓
                </button>
              </div>
            )}
          </div>
          <div className="panel-body output-body">
            {pinnedTurn !== null && activeDesign?.i !== designTurns[designTurns.length - 1]?.i && (
              <div className="version-banner" role="status">
                이전 버전을 보고 있어요. 이대로 수정 요청하면 이 버전을 기준으로 이어집니다.
                <button type="button" className="inline-link" onClick={() => setPinnedTurn(null)}>
                  최신 버전으로
                </button>
              </div>
            )}
            {loading && streamHtml ? (
              // Phase 9: live preview — the wireframe as it's being authored.
              <div className="output-wire streaming" aria-live="polite">
                <div className="stream-tag">✍️ 실시간으로 그리는 중…</div>
                <WireframePreview html={streamHtml} />
              </div>
            ) : latestResult ? (
              <div className="output-split">
                <div className="output-spec">
                  <SpecPanel markdown={latestResult.specMarkdown} />
                </div>
                <div className="output-wire">
                  <WireframePreview html={latestResult.wireframeHtml} />
                </div>
              </div>
            ) : (
              <div className="empty">
                왼쪽에서 요구사항을 입력하면
                <br />
                정의서와 와이어프레임이 여기에 표시됩니다.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function QuestionCard({
  questions,
  disabled,
  onSubmit,
}: {
  questions: ClarifyingQuestion[];
  disabled: boolean;
  onSubmit: (answers: { question: string; answer: string }[]) => void;
}) {
  // Each answer is a list of picked options: single-choice keeps ≤1, multi keeps many.
  const [picked, setPicked] = useState<Record<number, string[]>>({});
  const allAnswered = questions.every((_, i) => (picked[i]?.length ?? 0) > 0);

  function toggle(qi: number, opt: string, multi: boolean) {
    setPicked((p) => {
      const current = p[qi] ?? [];
      if (multi) {
        const next = current.includes(opt) ? current.filter((o) => o !== opt) : [...current, opt];
        return { ...p, [qi]: next };
      }
      // Single choice: selecting replaces; tapping the selected one clears it.
      return { ...p, [qi]: current[0] === opt ? [] : [opt] };
    });
  }

  return (
    <div className="qcard">
      <div className="qcard-head">더 정확한 화면을 위해 몇 가지만 알려주세요</div>
      {questions.map((q, qi) => (
        <div key={qi} className="qblock" role="group" aria-label={q.question}>
          <div className="qtext">
            {q.question}
            {q.multiSelect && <span className="qhint">복수 선택 가능</span>}
          </div>
          <div className="qopts">
            {q.options.map((opt) => {
              const on = (picked[qi] ?? []).includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  className={`qopt ${on ? 'sel' : ''} ${q.multiSelect ? 'multi' : ''}`}
                  aria-pressed={on}
                  disabled={disabled}
                  onClick={() => toggle(qi, opt, !!q.multiSelect)}
                >
                  {q.multiSelect && <span className="qcheck" aria-hidden="true" />}
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <button
        className="btn qsubmit"
        disabled={disabled || !allAnswered}
        onClick={() =>
          onSubmit(questions.map((q, i) => ({ question: q.question, answer: (picked[i] ?? []).join(', ') })))
        }
      >
        이 조건으로 만들기
      </button>
    </div>
  );
}
