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
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true">
            NH
          </span>
          <div>
            <h1>DesignMate</h1>
            <p>NH농협 사내 화면 설계 도우미</p>
          </div>
        </div>

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

        <p className="auth-note">알파 테스트 버전입니다. 계정·프로젝트는 서버에 저장돼 다른 기기에서도 이어집니다.</p>
      </div>
    </div>
  );
}
