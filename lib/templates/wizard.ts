import { wf } from './shared';
import type { DesignSpec } from '../engine/types';

/** 다단계 마법사 화면: 단계 표시기 + 현재 단계 입력 + 이전/다음. */
export function wizardBody(spec: DesignSpec): string {
  const steps = ['1 기본정보', '2 상세입력', '3 확인']
    .map((s, i) => `<div class="wf-tab ${i === 0 ? 'active' : ''}">${s}</div>`)
    .join('');

  const fields = ['항목 1', '항목 2', '항목 3'].map((f) => wf.input(f)).join('');

  return `
    ${wf.header(spec.title, '')}
    <div class="wf-body">
      ${wf.section('진행 단계', `<nav class="wf-tabbar" style="border:none;padding:0">${steps}</nav>`)}
      ${wf.section('1단계 · 기본정보 입력', fields)}
    </div>
    <div style="padding:12px 16px;border-top:2px dashed #d4d4d8;display:flex;gap:10px">
      <div style="flex:1">${wf.button('이전')}</div>
      <div style="flex:1">${wf.button('다음', true)}</div>
    </div>
  `;
}
