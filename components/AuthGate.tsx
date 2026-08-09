'use client';

import { useState } from 'react';

export interface AuthUser {
  id: string;
  username: string;
}

/** Login / register screen shown when there is no session. Calls onAuthed on success. */
export default function AuthGate({ onAuthed }: { onAuthed: (user: AuthUser) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = (await res.json()) as { user?: AuthUser; error?: string };
      if (!res.ok || !data.user) throw new Error(data.error || '요청에 실패했어요.');
      onAuthed(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했어요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-shell">
        {/* Left brand pane (desktop) */}
        <div className="auth-brandpane">
          <div className="auth-brandmark">
            <span className="brand-mark" aria-hidden="true">
              NH
            </span>
            <span className="auth-brandname">DesignMate</span>
          </div>
          <div className="auth-hero">
            <h2 className="auth-hero-title">
              필요한 화면을
              <br />
              말로 설명하면
              <br />
              정의서가 됩니다.
            </h2>
            <p className="auth-hero-sub">
              NH농협 사내 화면 설계 도우미. 요구사항을 대화로 다듬어 UI/UX 정의서와 와이어프레임을 함께 만들어 드립니다.
            </p>
          </div>
          <div className="auth-hero-feats">
            <span>정의서 자동 작성</span>
            <span>와이어프레임 미리보기</span>
            <span>버전 되돌리기</span>
          </div>
        </div>

        {/* Right form pane */}
        <div className="auth-formpane">
          <div className="auth-form-inner">
            <div className="auth-tabs" role="tablist" aria-label="로그인 또는 회원가입">
              <button
                role="tab"
                aria-selected={mode === 'login'}
                className={`auth-tab ${mode === 'login' ? 'on' : ''}`}
                onClick={() => {
                  setMode('login');
                  setError('');
                }}
              >
                로그인
              </button>
              <button
                role="tab"
                aria-selected={mode === 'register'}
                className={`auth-tab ${mode === 'register' ? 'on' : ''}`}
                onClick={() => {
                  setMode('register');
                  setError('');
                }}
              >
                회원가입
              </button>
            </div>
            <p className="auth-sub">
              {mode === 'login' ? '사내 사번과 비밀번호로 접속하세요.' : '아이디와 비밀번호로 계정을 만드세요.'}
            </p>

            <form className="auth-form" onSubmit={submit}>
              <label className="auth-field">
                <span>아이디</span>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  placeholder="영문·숫자 3~40자"
                  required
                />
              </label>
              <label className="auth-field">
                <span>비밀번호</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  placeholder="8자 이상"
                  required
                />
              </label>
              {error && (
                <div className="auth-error" role="alert">
                  {error}
                </div>
              )}
              <button className="btn auth-submit" type="submit" disabled={busy}>
                {busy ? '처리 중…' : mode === 'login' ? '로그인' : '가입하고 시작하기'}
              </button>
            </form>

            <p className="auth-note">
              알파 테스트 버전입니다. 계정·프로젝트는 서버에 저장돼 다른 기기에서도 이어집니다.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
