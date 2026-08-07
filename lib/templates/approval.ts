import { wf } from './shared';
import type { DesignSpec } from '../engine/types';

/** 승인/결재 워크플로우 화면: 요청 요약 + 결재선 + 승인/반려 액션. */
export function approvalBody(spec: DesignSpec): string {
  const steps = ['기안', '검토', '승인']
    .map((s, i) => `<div class="wf-tab ${i === 0 ? 'active' : ''}">${s}</div>`)
    .join('');

  const info = ['신청 구분', '신청자', '신청일', '금액']
    .map(
      (label) =>
        `<div class="wf-row"><div style="flex:0 0 120px;color:#a1a1aa;font-size:13px">${label}</div><div style="flex:1">${wf.textLines(1)}</div></div>`,
    )
    .join('');

  return `
    ${wf.header(spec.title, '이력')}
    <div class="wf-body">
      ${wf.section('결재선', `<nav class="wf-tabbar" style="border:none;justify-content:flex-start;gap:8px;padding:0">${steps}</nav>`)}
      ${wf.section('요청 정보', info)}
      ${wf.section('의견', wf.input('결재 의견'))}
    </div>
    <div style="padding:12px 16px;border-top:2px dashed #d4d4d8;display:flex;gap:10px">
      <div style="flex:1">${wf.button('반려')}</div>
      <div style="flex:1">${wf.button('승인', true)}</div>
    </div>
  `;
}
