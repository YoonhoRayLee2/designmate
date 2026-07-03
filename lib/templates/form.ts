import { wf } from './shared';
import type { DesignSpec } from '../engine/types';

export function formBody(spec: DesignSpec): string {
  const fields = ['이름', '연락처', '이메일', '내용']
    .map((f) => wf.input(f))
    .join('');
  return `
    ${wf.header(spec.title, '')}
    <div class="wf-body">
      ${wf.section('입력 항목', fields)}
      ${wf.section('첨부', wf.imageBox('파일 업로드 영역', '3 / 1'))}
      ${wf.button('제출하기', true)}
    </div>
  `;
}
