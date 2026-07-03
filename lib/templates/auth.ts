import { wf } from './shared';
import type { DesignSpec } from '../engine/types';

export function authBody(spec: DesignSpec): string {
  return `
    <div class="wf-body" style="display:flex;flex-direction:column;justify-content:center;gap:4px">
      <div style="text-align:center;margin-bottom:24px">
        <div style="width:56px;height:56px;border-radius:14px;background:#e4e4e7;border:1px dashed #a1a1aa;margin:0 auto 12px"></div>
        <div style="font-weight:700;font-size:18px;color:#3f3f46">${wf.esc(spec.title)}</div>
      </div>
      ${wf.input('이메일 / 아이디')}
      ${wf.input('비밀번호')}
      ${wf.button('로그인', true)}
      ${wf.button('회원가입')}
      <div style="text-align:center;margin-top:16px;font-size:12px;color:#a1a1aa">
        — 소셜 로그인 —
      </div>
      <div style="display:flex;gap:10px;margin-top:8px">
        <div style="flex:1">${wf.button('Kakao')}</div>
        <div style="flex:1">${wf.button('Apple')}</div>
      </div>
    </div>
  `;
}
