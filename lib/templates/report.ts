import { wf } from './shared';
import type { DesignSpec } from '../engine/types';

/** 리포트/출력 화면: 조회 조건 + 집계 표 + 출력/다운로드 액션. */
export function reportBody(spec: DesignSpec): string {
  const filters = ['조회 기간', '지점', '구분'].map((f) => wf.input(f)).join('');

  const rows = ['행 #1', '행 #2', '행 #3', '행 #4', '합계']
    .map(
      (r, i) =>
        `<div class="wf-row" style="${i === 4 ? 'font-weight:600;color:#3f3f46' : ''}"><div style="flex:1">${wf.textLines(1)}</div><div style="flex:0 0 80px">${wf.textLines(1)}</div><div style="flex:0 0 80px">${wf.textLines(1)}</div></div>`,
    )
    .join('');

  return `
    ${wf.header(spec.title, '출력')}
    <div class="wf-body">
      ${wf.section('조회 조건', `${filters}${wf.button('조회', true)}`)}
      ${wf.section('집계 결과', rows)}
      ${wf.section('내보내기', `<div style="display:flex;gap:10px">${wf.button('엑셀')}${wf.button('PDF')}${wf.button('인쇄')}</div>`)}
    </div>
  `;
}
