import type { DesignSpec } from './engine/types';

const TYPE_LABEL: Record<DesignSpec['screenType'], string> = {
  list: '목록/피드',
  detail: '상세',
  form: '폼/입력',
  dashboard: '대시보드',
  auth: '인증(로그인/가입)',
  approval: '승인/결재',
  wizard: '다단계 마법사',
  report: '리포트/출력',
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

  // --- A1: 실무 설계서용 심화 섹션. 값이 있을 때만 렌더한다. ---
  if (spec.dataFields?.length) {
    lines.push('## 데이터 필드 명세');
    lines.push('');
    lines.push('| 필드 | 타입 | 필수 | 검증/자릿수 | 마스킹 |');
    lines.push('| --- | --- | --- | --- | --- |');
    spec.dataFields.forEach((f) => {
      lines.push(
        `| ${f.name} | ${f.type} | ${f.required ? '필수' : '선택'} | ${f.rule || '-'} | ${f.masking || '-'} |`,
      );
    });
    lines.push('');
  }

  if (spec.permissions?.length) {
    lines.push('## 권한 매트릭스');
    lines.push('');
    lines.push('| 역할 | 허용 액션 |');
    lines.push('| --- | --- |');
    spec.permissions.forEach((p) => lines.push(`| ${p.role} | ${p.actions} |`));
    lines.push('');
  }

  if (spec.exceptions?.length) {
    lines.push('## 예외·오류 케이스');
    lines.push('');
    spec.exceptions.forEach((e) => lines.push(`- ${e}`));
    lines.push('');
  }

  if (spec.integrations?.length) {
    lines.push('## 연계 시스템');
    lines.push('');
    spec.integrations.forEach((i) => lines.push(`- ${i}`));
    lines.push('');
  }

  if (spec.nonFunctional?.length) {
    lines.push('## 비기능 요구');
    lines.push('');
    spec.nonFunctional.forEach((n) => lines.push(`- ${n}`));
    lines.push('');
  }

  return lines.join('\n');
}
