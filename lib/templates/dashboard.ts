import { wf } from './shared';
import type { DesignSpec } from '../engine/types';

export function dashboardBody(spec: DesignSpec): string {
  const stats = [
    { num: '1,284', lbl: '총 건수' },
    { num: '92%', lbl: '완료율' },
    { num: '37', lbl: '오늘 신규' },
    { num: '4.6', lbl: '평균 평점' },
  ]
    .map((s) => `<div class="wf-stat"><div class="num">${s.num}</div><div class="lbl">${s.lbl}</div></div>`)
    .join('');

  const rows = ['행 #1', '행 #2', '행 #3', '행 #4']
    .map(
      (r) =>
        `<div class="wf-row"><div class="wf-avatar"></div><div style="flex:1">${wf.textLines(1)}</div><span class="wf-pill">상태</span></div>`,
    )
    .join('');

  return `
    ${wf.header(spec.title, '설정')}
    <div class="wf-body">
      ${wf.section('요약 지표', `<div class="wf-grid">${stats}</div>`)}
      ${wf.section('추이 그래프', wf.imageBox('차트 영역', '16 / 9'))}
      ${wf.section('최근 목록', rows)}
    </div>
  `;
}
