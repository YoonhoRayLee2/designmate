'use client';

import { useEffect, useRef, useState } from 'react';
import SpecPanel from '@/components/SpecPanel';
import WireframePreview from '@/components/WireframePreview';
import AuthGate, { type AuthUser } from '@/components/AuthGate';
import type { ChatMessage, ClarifyingQuestion, EngineOutput, GenerateResult, StreamEvent } from '@/lib/engine/types';

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

// Simple client-generated id (server stores it as the project primary key).
function newId(): string {
  return `p_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/** Derive a project title from its first generated design, else a placeholder. */
function deriveProjectTitle(turns: Turn[]): string {
  const firstDesign = turns.find((t): t is Extract<Turn, { kind: 'design' }> => t.kind === 'design');
  return firstDesign?.result.spec.title?.trim() || '새 프로젝트';
}

/** Strip base64 images before sending to the server — they bloat the payload and aren't persisted. */
function turnForStorage(t: Turn): Turn {
  if (t.kind === 'user' && t.images) {
    const { images, ...rest } = t;
    void images;
    return rest;
  }
  return t;
}

/** Save one project to the server. Returns false on auth failure so the caller can re-gate. */
async function saveProjectToServer(p: Project): Promise<boolean> {
  const res = await fetch(`/api/projects/${p.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: p.title, turns: p.turns.map(turnForStorage), updatedAt: p.updatedAt }),
  });
  return res.ok || res.status !== 401;
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
  // Auth: null = not logged in, undefined = still checking (show nothing yet).
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  // Phase 14: project dashboard overlay + export modal (both purely additive).
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  // Phase 15: styled delete confirm, unified toast, project-load skeleton.
  const [confirmDel, setConfirmDel] = useState<{ id: string; title: string } | null>(null);
  const [toast, setToast] = useState('');
  const [projectLoading, setProjectLoading] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const hydrated = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // On mount: check session, then load the user's projects from the server.
  useEffect(() => {
    (async () => {
      try {
        const meRes = await fetch('/api/auth/me');
        const me = (await meRes.json()) as { user: AuthUser | null };
        setUser(me.user);
        if (me.user) await loadProjectsFromServer();
      } catch {
        setUser(null);
      } finally {
        hydrated.current = true;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the project list (summaries) and open the most recent one's detail.
  async function loadProjectsFromServer() {
    const res = await fetch('/api/projects');
    if (!res.ok) return;
    const data = (await res.json()) as { projects: { id: string; title: string; updatedAt: number }[] };
    const summaries = data.projects.map((s) => ({ ...s, turns: [] as Turn[] }));
    setProjects(summaries);
    const first = summaries[0];
    if (first) {
      const detail = await fetchProjectDetail(first.id);
      setActiveId(first.id);
      setTurns(detail);
      setProjects((prev) => prev.map((p) => (p.id === first.id ? { ...p, turns: detail } : p)));
    }
  }

  async function fetchProjectDetail(id: string): Promise<Turn[]> {
    const res = await fetch(`/api/projects/${id}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { project: { turns: Turn[] } };
    return data.project.turns ?? [];
  }

  // Persist whenever turns change: fold current turns into the active project,
  // then debounce a save to the server.
  useEffect(() => {
    if (!hydrated.current || !user) return;
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
      // Debounced server save of the active project.
      const target = next.find((p) => p.id === id);
      if (target) {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          saveProjectToServer(target).then((ok) => {
            if (!ok) {
              showToast('세션이 만료되어 다시 로그인해 주세요');
              setUser(null); // session expired → back to AuthGate
            }
          });
        }, 600);
      }
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

  async function switchProject(id: string) {
    const p = projects.find((x) => x.id === id);
    if (!p) return;
    setActiveId(id);
    setError('');
    setLastFailed(null);
    setInput('');
    setPendingImages([]);
    setPinnedTurn(null);
    setDrawerOpen(false);
    // Load turns lazily from the server if this summary hasn't been fetched yet.
    let detail = p.turns;
    if (!detail.length) {
      setProjectLoading(true);
      detail = await fetchProjectDetail(id);
      setProjects((prev) => prev.map((x) => (x.id === id ? { ...x, turns: detail } : x)));
      setProjectLoading(false);
    }
    setTurns(detail);
    setMobileView(detail.some((t) => t.kind === 'design') ? 'result' : 'chat');
  }

  // Open the styled confirm modal (Phase 15).
  function deleteProject(id: string) {
    const p = projects.find((x) => x.id === id);
    setConfirmDel({ id, title: p?.title ?? '이 프로젝트' });
  }

  // Actually delete, after the user confirms in the modal.
  // Optimistic: remove from UI immediately, then roll back if the server rejects.
  async function performDelete(id: string) {
    setConfirmDel(null);
    const prevProjects = projects;
    const prevActiveId = activeId;
    const prevTurns = turns;

    setProjects((prev) => {
      const next = prev.filter((p) => p.id !== id);
      if (id === activeId) {
        const nextActive = next[0] ?? null;
        setActiveId(nextActive?.id ?? null);
        setTurns(nextActive?.turns ?? []);
      }
      return next;
    });

    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(String(res.status));
      showToast('프로젝트를 삭제했어요');
    } catch {
      // Roll back the optimistic removal.
      setProjects(prevProjects);
      setActiveId(prevActiveId);
      setTurns(prevTurns);
      showToast('삭제에 실패했어요. 다시 시도해 주세요');
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setProjects([]);
    setActiveId(null);
    setTurns([]);
    setDrawerOpen(false);
  }

  // Called by AuthGate after a successful login/register.
  function handleAuthed(u: AuthUser) {
    setUser(u);
    hydrated.current = false; // avoid a spurious save before projects load
    loadProjectsFromServer().finally(() => {
      hydrated.current = true;
    });
  }

  function copy(text: string, label: string) {
    navigator.clipboard?.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 1500);
  }

  // Phase 15: a short floating toast for save/session/delete feedback.
  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  }

  // Phase 14: safe filename base from the active design's title.
  function exportBase(): string {
    const title = latestResult?.spec.title?.trim() || '화면';
    const safe = title.replace(/[\\/:*?"<>|]/g, '').slice(0, 40);
    return `designmate-${safe}`;
  }
  // Open a project from the dashboard (reuses existing switchProject).
  function openFromDashboard(id: string) {
    setDashboardOpen(false);
    switchProject(id);
  }

  const started = turns.length > 0;

  // Auth gating: nothing while checking, login screen when logged out.
  if (user === undefined) return <div className="app auth-loading" aria-busy="true" />;
  if (user === null) return <AuthGate onAuthed={handleAuthed} />;

  return (
    <div className="app">
      {/* Left rail — always visible on desktop, slide-in drawer on mobile */}
      {drawerOpen && <div className="rail-backdrop" onClick={() => setDrawerOpen(false)} />}
      <aside className={`rail ${drawerOpen ? 'open' : ''}`} aria-label="프로젝트 목록">
        <div className="rail-brand">
          <span className="brand-mark" aria-hidden="true">
            NH
          </span>
          <span className="rail-brandname">DesignMate</span>
        </div>
        <div className="rail-newwrap">
          <button className="rail-new" onClick={newProject}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M7 2.5v9M2.5 7h9" />
            </svg>
            새 대화
          </button>
        </div>
        <div className="rail-label">
          <span>최근 프로젝트</span>
          <button
            className="rail-label-btn"
            onClick={() => {
              setDashboardOpen(true);
              setDrawerOpen(false);
            }}
          >
            전체 보기
          </button>
        </div>
        <div className="rail-list">
          {projects.length === 0 && <div className="rail-empty">아직 저장된 프로젝트가 없어요.</div>}
          {projects.map((p) => (
            <div key={p.id} className={`rail-item ${p.id === activeId ? 'active' : ''}`}>
              <button className="rail-item-main" onClick={() => switchProject(p.id)}>
                <span className="rail-item-title">{p.title}</span>
                <span className="rail-item-time">{new Date(p.updatedAt).toLocaleString('ko-KR')}</span>
              </button>
              <button className="rail-item-del" onClick={() => deleteProject(p.id)} aria-label="삭제">
                ✕
              </button>
            </div>
          ))}
        </div>
        <div className="rail-foot">
          <span className="rail-avatar" aria-hidden="true">
            {user.username.slice(0, 2)}
          </span>
          <span className="rail-user" title={user.username}>
            {user.username}
          </span>
          <button className="rail-logout" onClick={logout}>
            로그아웃
          </button>
        </div>
      </aside>

      <div className="main">
        {/* Slim mobile top bar (hidden on desktop) */}
        <div className="mobile-top">
          <button className="mobile-menu" onClick={() => setDrawerOpen(true)} aria-label="메뉴 열기">
            ☰
          </button>
          <span className="mobile-title">DesignMate</span>
          <button className="mobile-newbtn" onClick={newProject} aria-label="새 대화">
            ＋
          </button>
        </div>

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
                  <button className="btn-ghost btn-ghost-accent" onClick={() => setExportOpen(true)}>
                    내보내기
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
              {projectLoading ? (
                // Phase 15: skeleton while a project's detail loads.
                <div className="skel" aria-hidden="true">
                  <div className="skel-line w40" style={{ height: 26 }} />
                  <div className="skel-line w62" />
                  <div className="skel-row">
                    <div className="skel-card" />
                    <div className="skel-card" />
                    <div className="skel-card" />
                  </div>
                  <div className="skel-block">
                    <div className="skel-line w30" />
                    <div className="skel-line w100" />
                    <div className="skel-line w92" />
                    <div className="skel-line w74" />
                  </div>
                </div>
              ) : loading && streamHtml ? (
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

      {/* Phase 14 (e): 프로젝트 대시보드 오버레이 */}
      {dashboardOpen && (
        <div className="dash" role="dialog" aria-label="프로젝트 목록">
          <div className="dash-head">
            <span className="dash-head-title">프로젝트</span>
            <div className="dash-head-actions">
              <button
                className="btn"
                onClick={() => {
                  setDashboardOpen(false);
                  newProject();
                }}
              >
                + 새 대화
              </button>
              <button className="btn-ghost" onClick={() => setDashboardOpen(false)} aria-label="닫기">
                ✕
              </button>
            </div>
          </div>
          <div className="dash-body">
            <h2 className="dash-title">내 프로젝트</h2>
            <p className="dash-sub">최근 순으로 정렬됩니다. 카드를 열면 대화와 정의서가 그대로 이어집니다.</p>
            <div className="dash-stats">
              <div>
                <div className="dash-stat-num">{projects.length}</div>
                <div className="dash-stat-lbl">전체 프로젝트</div>
              </div>
              <div className="dash-stat-div" />
              <div>
                <div className="dash-stat-num">
                  {projects.filter((p) => Date.now() - p.updatedAt < 7 * 864e5).length}
                </div>
                <div className="dash-stat-lbl">이번 주</div>
              </div>
            </div>
            <div className="dash-grid">
              {projects.map((p) => (
                <div key={p.id} className="dash-card" onClick={() => openFromDashboard(p.id)}>
                  <div className="dash-card-title">{p.title}</div>
                  <div className="dash-card-time">{new Date(p.updatedAt).toLocaleString('ko-KR')}</div>
                  <button
                    className="dash-card-del"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteProject(p.id);
                    }}
                    aria-label="삭제"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                className="dash-card dash-card-new"
                onClick={() => {
                  setDashboardOpen(false);
                  newProject();
                }}
              >
                <span className="dash-plus" aria-hidden="true">
                  ＋
                </span>
                새 화면 만들기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phase 14 (f): 내보내기 모달 — 기존 download/copy 액션 재사용 */}
      {exportOpen && latestResult && (
        <div className="modal-backdrop" onClick={() => setExportOpen(false)}>
          <div className="modal" role="dialog" aria-label="내보내기" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">내보내기</div>
              <div className="modal-sub">{latestResult.spec.title}</div>
            </div>
            <div className="modal-opts">
              <button
                className="modal-opt"
                onClick={() => {
                  download(`${exportBase()}-정의서.md`, latestResult.specMarkdown, 'text/markdown');
                  setExportOpen(false);
                }}
              >
                <span className="modal-opt-ic" aria-hidden="true">
                  📄
                </span>
                <span className="modal-opt-main">
                  <span className="modal-opt-name">UI/UX 정의서</span>
                  <span className="modal-opt-desc">Markdown (.md)</span>
                </span>
                <span className="modal-opt-dl">내려받기</span>
              </button>
              <button
                className="modal-opt"
                onClick={() => {
                  download(`${exportBase()}-wireframe.html`, latestResult.wireframeHtml, 'text/html');
                  setExportOpen(false);
                }}
              >
                <span className="modal-opt-ic" aria-hidden="true">
                  🖥️
                </span>
                <span className="modal-opt-main">
                  <span className="modal-opt-name">와이어프레임 HTML</span>
                  <span className="modal-opt-desc">단일 파일 · 개발 인수인계용</span>
                </span>
                <span className="modal-opt-dl">내려받기</span>
              </button>
            </div>
            <div className="modal-file">
              <span>파일명</span>
              <code>{exportBase()}</code>
            </div>
            <div className="modal-foot">
              <button className="btn-ghost" onClick={() => setExportOpen(false)}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phase 15: styled delete confirmation */}
      {confirmDel && (
        <div className="modal-backdrop" onClick={() => setConfirmDel(null)}>
          <div className="modal modal-sm" role="dialog" aria-label="삭제 확인" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">프로젝트를 삭제할까요?</div>
              <div className="modal-sub">
                “{confirmDel.title}” 프로젝트와 대화·정의서가 모두 삭제됩니다. 되돌릴 수 없어요.
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn-ghost" onClick={() => setConfirmDel(null)}>
                취소
              </button>
              <button className="btn btn-danger" onClick={() => performDelete(confirmDel.id)}>
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phase 15: floating toast */}
      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
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
