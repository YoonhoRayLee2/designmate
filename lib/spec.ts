import type { DesignSpec } from './engine/types';

const TYPE_LABEL: Record<DesignSpec['screenType'], string> = {
  list: '목록/피드',
  detail: '상세',
  form: '폼/입력',
  dashboard: '대시보드',
  auth: '인증(로그인/가입)',
};

/** Render a DesignSpec as a UI/UX specification document in markdown. */
export function renderSpecMarkdown(spec: DesignSpec): string {
  const lines: string[] = [];

  lines.push(`# ${spec.title}`);
  lines.push('');
  lines.push(`**화면 유형:** ${TYPE_LABEL[spec.screenType]}　|　**도메인:** ${spec.domain}`);
  lines.push('');
  lines.push(spec.summary);
  lines.push('');

  lines.push('## 화면 구성');
  lines.push('');
  spec.screens.forEach((s, i) => {
    lines.push(`### ${i + 1}. ${s.name}`);
    lines.push(`- **목적:** ${s.purpose}`);
    lines.push(`- **주요 요소:** ${s.components.join(', ')}`);
    lines.push('');
  });

  lines.push('## 컴포넌트 정의');
  lines.push('');
  lines.push('| 컴포넌트 | 설명 | 상태 |');
  lines.push('| --- | --- | --- |');
  spec.components.forEach((c) => {
    lines.push(`| ${c.name} | ${c.description} | ${(c.states ?? []).join(' / ') || '-'} |`);
  });
  lines.push('');

  lines.push('## 사용자 플로우');
  lines.push('');
  lines.push(spec.userFlow.map((step) => `${step}`).join(' → '));
  lines.push('');

  lines.push('## 디자인 노트');
  lines.push('');
  spec.designNotes.forEach((n) => lines.push(`- ${n}`));
  lines.push('');

  return lines.join('\n');
}
