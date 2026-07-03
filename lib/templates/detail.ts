import { wf } from './shared';
import type { DesignSpec } from '../engine/types';

export function detailBody(spec: DesignSpec): string {
  return `
    ${wf.header('‹ 뒤로', '공유')}
    <div class="wf-body">
      ${wf.imageBox('대표 이미지', '4 / 3')}
      ${wf.section(spec.title, wf.textLines(1))}
      <div style="font-size:20px;font-weight:700;color:#3f3f46;margin:4px 0 12px">가격 / 핵심 정보</div>
      ${wf.section('설명', wf.textLines(4))}
      ${wf.section('상세 정보', `
        <div class="wf-row"><div class="wf-avatar"></div><div style="flex:1">${wf.textLines(2)}</div></div>
        <div class="wf-row"><div class="wf-avatar"></div><div style="flex:1">${wf.textLines(2)}</div></div>
      `)}
    </div>
    <div style="padding:12px 16px;border-top:2px dashed #d4d4d8;display:flex;gap:10px">
      ${wf.button('찜')}
      <div style="flex:1">${wf.button('주요 액션 (구매/신청)', true)}</div>
    </div>
  `;
}
