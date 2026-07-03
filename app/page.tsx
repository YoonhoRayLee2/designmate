'use client';

import { useEffect, useRef, useState } from 'react';
import SpecPanel from '@/components/SpecPanel';
import WireframePreview from '@/components/WireframePreview';
import type { ChatMessage, ClarifyingQuestion, EngineOutput, GenerateResult } from '@/lib/engine/types';

const STORAGE_KEY = 'designmate.session.v2';

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

interface Session {
  turns: Turn[];
}

function loadSession(): Session {
  if (typeof window === 'undefined') return { turns: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Session;
  } catch {
    /* ignore corrupt storage */
  }
  return { turns: [] };
}

export default function Home() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const threadRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTurns(loadSession().turns);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ turns }));
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns]);

  const latestResult = [...turns].reverse().find((t): t is Extract<Turn, { kind: 'design' }> => t.kind === 'design')
    ?.result;

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
    setLoading(true);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: buildHistory([userMessage]), currentSpec: latestResult?.spec }),
      });
      const data = (await res.json()) as EngineOutput | { error: string };
      if (!res.ok || 'error' in data) throw new Error(('error' in data && data.error) || '생성에 실패했습니다.');

      if (data.mode === 'questions') {
        setTurns((prev) => [...prev, { kind: 'questions', questions: data.questions }]);
      } else {
        setTurns((prev) => [...prev, { kind: 'design', result: data }]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
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
  function newSession() {
    if (turns.length && !confirm('현재 대화를 지우고 새로 시작할까요?')) return;
    setTurns([]);
    setError('');
    setInput('');
  }
  function copy(text: string) {
    navigator.clipboard?.writeText(text);
  }

  const started = turns.length > 0;

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">NH</span>
          <div>
            <h1>DesignMate</h1>
            <p>NH농협 사내 화면 설계 도우미 · 요구사항을 대화로 다듬어 정의서와 와이어프레임을 만듭니다.</p>
          </div>
        </div>
        {started && (
          <button className="btn-ghost" onClick={newSession}>
            새 대화
          </button>
        )}
      </header>

      <div className="results">
        <section className="panel chat-panel">
          <div className="panel-head">
            <h2>대화</h2>
          </div>
          <div className="panel-body chat-thread" ref={threadRef}>
            {!started && (
              <div className="chat-intro">
                <p>어떤 화면이 필요하신가요? 만들고 싶은 업무 화면을 설명해 주세요.</p>
                <p className="hint">
                  정보가 부족하면 몇 가지를 먼저 여쭤봐요. 생성 후 “목록에 지점 필터 추가해줘”처럼 이어서 요청하면 계속
                  개선됩니다.
                </p>
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
              if (t.kind === 'design')
                return (
                  <div key={i} className="bubble bot">
                    <strong>{t.result.spec.title}</strong> 화면을 만들었어요.
                    <span className="meta">
                      {t.result.spec.screenType} · {t.result.spec.domain}
                    </span>
                  </div>
                );
              return (
                <QuestionCard
                  key={i}
                  questions={t.questions}
                  disabled={loading || !!t.answered}
                  onSubmit={(answers) => submitAnswers(i, answers)}
                />
              );
            })}

            {loading && <div className="bubble bot loading">생각 중…</div>}
            {error && <div className="error">{error}</div>}
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
            >
              📎
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={
                started ? '수정/추가 요청을 입력하세요 (⌘/Ctrl + Enter)' : '예: 조합원 대출 신청 화면 만들어줘 (⌘/Ctrl + Enter)'
              }
            />
            <button className="btn" type="submit" disabled={loading}>
              {loading ? '…' : '보내기'}
            </button>
          </form>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>정의서 &amp; 와이어프레임</h2>
            {latestResult && (
              <div className="head-actions">
                <button className="btn-ghost" onClick={() => copy(latestResult.specMarkdown)}>
                  정의서 복사
                </button>
                <button className="btn-ghost" onClick={() => copy(latestResult.wireframeHtml)}>
                  HTML 복사
                </button>
              </div>
            )}
          </div>
          <div className="panel-body output-body">
            {latestResult ? (
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
  const [picked, setPicked] = useState<Record<number, string>>({});
  const allAnswered = questions.every((_, i) => picked[i]);

  return (
    <div className="qcard">
      <div className="qcard-head">더 정확한 화면을 위해 몇 가지만 알려주세요</div>
      {questions.map((q, qi) => (
        <div key={qi} className="qblock">
          <div className="qtext">{q.question}</div>
          <div className="qopts">
            {q.options.map((opt) => (
              <button
                key={opt}
                type="button"
                className={`qopt ${picked[qi] === opt ? 'sel' : ''}`}
                disabled={disabled}
                onClick={() => setPicked((p) => ({ ...p, [qi]: opt }))}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      ))}
      <button
        className="btn qsubmit"
        disabled={disabled || !allAnswered}
        onClick={() => onSubmit(questions.map((q, i) => ({ question: q.question, answer: picked[i] })))}
      >
        이 조건으로 만들기
      </button>
    </div>
  );
}
