import { wf } from './shared';
import type { DesignSpec } from '../engine/types';

export function listBody(spec: DesignSpec): string {
  const cards = ['항목 A', '항목 B', '항목 C', '항목 D']
    .map((t) => wf.card(t))
    .join('');
  return `
    ${wf.header(spec.title, '검색')}
    ${wf.bar('🔍  검색 / 필터 바')}
    <div class="wf-body">
      ${wf.section('카테고리', `<div style="display:flex;gap:8px;flex-wrap:wrap">${['전체', '인기', '신규', '추천'].map((c) => wf.esc(c)).map((c) => `<span class="wf-pill">${c}</span>`).join('')}</div>`)}
      ${wf.section(`${spec.domain} 목록`, `<div class="wf-grid">${cards}</div>`)}
    </div>
    ${wf.tabbar(['홈', '검색', '찜', '내정보'])}
  `;
}
