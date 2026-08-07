// NH농협 디자인 토큰 — 단일 진실 공급원(SSOT).
// 생성 산출물(고충실도 HTML)의 색·타이포·간격 언어를 여기 한 곳에서 정의한다.
// groqEngine 의 프롬프트는 이 값을 문자열로 조립해 사용하므로, 톤을 바꾸려면 여기만 고친다.
//
// (와이어프레임 저충실도 톤은 별개 SSOT: lib/templates/shared.ts 의 wrapDocument.)

export const nhTokens = {
  color: {
    primary: '#00873c', // 딥그린 (NH 주색)
    primaryDark: '#006b30', // 진한 변형 (hover/강조)
    primarySoft: '#e6f3ec', // 옅은 배경 (선택/헤더 톤)
    text: '#1f2a24', // 본문
    textMuted: '#6b7a72', // 보조 텍스트
    border: '#dbe3de', // 경계선
    pageBg: '#f4f6f5', // 페이지 배경
    cardBg: '#ffffff', // 카드
    danger: '#c0392b', // 위험/오류
  },
  typography: {
    heading: '18~22px / 700',
    body: '14px',
  },
  spacing: {
    pad: '16~24px', // 패딩
    radius: '10~14px', // 카드/패널 라운드
  },
  status: {
    approved: '초록', // 승인
    rejected: '빨강', // 반려
    pending: '회색', // 대기
  },
} as const;

/** 프롬프트에 넣을 색 지시 한 줄을 토큰에서 조립한다. */
export function colorGuideLine(): string {
  const c = nhTokens.color;
  return `NH 브랜드 톤: 주색 ${c.primary}(딥그린), 진한 변형 ${c.primaryDark}, 옅은 배경 ${c.primarySoft}. 본문 ${c.text}, 보조 ${c.textMuted}, 경계선 ${c.border}, 페이지 배경 ${c.pageBg}, 카드 ${c.cardBg}. 위험 ${c.danger}.`;
}

/** 프롬프트에 넣을 타이포·간격·상태색 지시 한 줄. */
export function stylingGuideLine(): string {
  const t = nhTokens.typography;
  const s = nhTokens.spacing;
  const st = nhTokens.status;
  return `실제 UI 품질: 적절한 여백(${s.pad}), 카드/패널 라운드(${s.radius})+옅은 그림자, 타이포 위계(제목 ${t.heading}, 본문 ${t.body}), 버튼·뱃지·탭·테이블·폼에 realistic 스타일. 상태는 색 뱃지로(승인=${st.approved}, 반려=${st.rejected}, 대기=${st.pending}).`;
}
