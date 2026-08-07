import type { DesignEngine, DesignSpec, EngineOutput, GenerateRequest, ScreenType } from './types';
import { wrapDocument } from '../templates/shared';
import { listBody } from '../templates/list';
import { detailBody } from '../templates/detail';
import { formBody } from '../templates/form';
import { dashboardBody } from '../templates/dashboard';
import { authBody } from '../templates/auth';
import { approvalBody } from '../templates/approval';
import { wizardBody } from '../templates/wizard';
import { reportBody } from '../templates/report';
import { renderSpecMarkdown } from '../spec';

const TYPE_RULES: { type: ScreenType; keywords: string[] }[] = [
  { type: 'auth', keywords: ['로그인', '가입', '회원', 'signin', 'signup', 'login', 'auth', '인증'] },
  { type: 'approval', keywords: ['승인', '결재', '반려', '전결', '기안', '결재선', 'approval'] },
  { type: 'wizard', keywords: ['마법사', '단계별', '다단계', '스텝', 'wizard', '단계 입력'] },
  { type: 'report', keywords: ['리포트', '보고서', '집계', '출력', '통계표', '실적', 'report'] },
  { type: 'dashboard', keywords: ['대시보드', '통계', '관리자', '어드민', 'dashboard', 'admin', '지표', '현황'] },
  { type: 'detail', keywords: ['상세', '디테일', 'detail', '프로필', '페이지 상세'] },
  { type: 'form', keywords: ['폼', '입력', '등록', '작성', '신청', 'form', '문의', '예약', '주문서'] },
  { type: 'list', keywords: ['목록', '리스트', '피드', '상품들', '게시글', 'list', 'feed', '검색결과'] },
];

const DOMAIN_RULES: { domain: string; keywords: string[] }[] = [
  { domain: '쇼핑/커머스', keywords: ['쇼핑', '커머스', '상품', '스토어', '마켓', 'shop', 'commerce', '장바구니'] },
  { domain: '소셜/커뮤니티', keywords: ['소셜', '커뮤니티', 'sns', '게시글', '피드', '팔로우'] },
  { domain: '예약/서비스', keywords: ['예약', '병원', '식당', '숙소', '부킹', 'booking'] },
  { domain: '금융/핀테크', keywords: ['금융', '송금', '결제', '자산', '핀테크', 'bank'] },
  { domain: '콘텐츠/미디어', keywords: ['영상', '뉴스', '아티클', '음악', '콘텐츠', 'media'] },
];

function pick<T extends { keywords: string[] }>(rules: T[], text: string): T | undefined {
  return rules.find((r) => r.keywords.some((k) => text.includes(k)));
}

function detectType(text: string): ScreenType {
  return pick(TYPE_RULES, text)?.type ?? 'list';
}

function detectDomain(text: string): string {
  return pick(DOMAIN_RULES, text)?.domain ?? '일반';
}

function deriveTitle(prompt: string): string {
  const trimmed = prompt.trim().replace(/\s+/g, ' ');
  if (!trimmed) return '화면';
  return trimmed.length > 24 ? trimmed.slice(0, 24) + '…' : trimmed;
}

const BODY_BY_TYPE: Record<ScreenType, (s: DesignSpec) => string> = {
  list: listBody,
  detail: detailBody,
  form: formBody,
  dashboard: dashboardBody,
  auth: authBody,
  approval: approvalBody,
  wizard: wizardBody,
  report: reportBody,
};

function buildSpec(prompt: string): DesignSpec {
  const text = prompt.toLowerCase();
  const screenType = detectType(text);
  const domain = detectDomain(text);
  const title = deriveTitle(prompt);

  const specsByType: Record<ScreenType, Omit<DesignSpec, 'title' | 'screenType' | 'domain'>> = {
    list: {
      summary: `${domain} 항목을 탐색하고 필터링하는 목록형 화면.`,
      screens: [
        {
          name: '목록 화면',
          purpose: '항목을 카드/리스트로 훑어보기',
          components: ['검색바', '필터 칩', '카드 그리드', '하단 탭바'],
        },
        { name: '검색 화면', purpose: '키워드로 항목 찾기', components: ['검색 입력', '최근 검색어', '결과 목록'] },
      ],
      components: [
        { name: '검색/필터 바', description: '키워드 검색과 카테고리 필터', states: ['기본', '포커스', '결과 없음'] },
        { name: '항목 카드', description: '썸네일 + 제목 + 요약', states: ['기본', '찜됨', '품절/비활성'] },
        { name: '하단 탭바', description: '주요 섹션 간 이동', states: ['활성', '비활성'] },
      ],
      userFlow: ['목록 진입', '필터/검색으로 좁히기', '카드 선택', '상세 화면 이동'],
      designNotes: [
        '무한 스크롤 또는 페이지네이션 결정 필요',
        '빈 상태(Empty state) 문구 정의',
        '카드 탭 영역 충분히 확보(최소 44px)',
      ],
    },
    detail: {
      summary: `단일 ${domain} 항목의 상세 정보와 핵심 액션을 담는 화면.`,
      screens: [
        {
          name: '상세 화면',
          purpose: '항목 정보 확인 및 액션 수행',
          components: ['대표 이미지', '핵심 정보', '설명', '하단 고정 CTA'],
        },
      ],
      components: [
        { name: '이미지 갤러리', description: '대표 이미지 + 추가 이미지 스와이프', states: ['단일', '다중', '로딩'] },
        { name: '핵심 정보 블록', description: '제목/가격/상태 등 요약', states: ['기본', '할인/강조'] },
        { name: '하단 고정 CTA', description: '주요 전환 액션 버튼', states: ['활성', '비활성', '로딩'] },
      ],
      userFlow: ['목록에서 진입', '정보 확인', '이미지 탐색', '주요 액션(구매/신청) 수행'],
      designNotes: [
        'CTA는 스크롤과 무관하게 하단 고정',
        '공유/찜 등 보조 액션 위치 정의',
        '긴 설명은 접기/펼치기 고려',
      ],
    },
    form: {
      summary: `${domain} 정보를 입력·제출하는 폼 화면.`,
      screens: [
        {
          name: '입력 화면',
          purpose: '필수/선택 정보 입력',
          components: ['입력 필드', '파일 첨부', '유효성 안내', '제출 버튼'],
        },
        { name: '완료 화면', purpose: '제출 결과 확인', components: ['완료 메시지', '후속 액션'] },
      ],
      components: [
        { name: '입력 필드', description: '텍스트/선택/날짜 등', states: ['기본', '포커스', '오류', '비활성'] },
        { name: '제출 버튼', description: '폼 전송 트리거', states: ['활성', '비활성', '로딩'] },
        { name: '유효성 메시지', description: '필드별 오류 안내', states: ['숨김', '표시'] },
      ],
      userFlow: ['폼 진입', '필드 입력', '유효성 확인', '제출', '완료 화면'],
      designNotes: ['필수 항목 표시 규칙 정의', '실시간 vs 제출 시 유효성 검사 결정', '제출 실패 시 오류 복구 흐름'],
    },
    dashboard: {
      summary: `${domain} 핵심 지표를 한눈에 보고 관리하는 대시보드.`,
      screens: [
        { name: '대시보드', purpose: '핵심 지표와 추이 파악', components: ['요약 카드', '차트', '최근 목록', '필터'] },
      ],
      components: [
        { name: '지표 카드', description: 'KPI 수치 + 증감', states: ['상승', '하락', '변동 없음'] },
        { name: '차트', description: '시계열 추이 시각화', states: ['데이터 있음', '데이터 없음', '로딩'] },
        { name: '데이터 테이블/목록', description: '최근 항목 및 상태', states: ['기본', '정렬됨', '빈 상태'] },
      ],
      userFlow: ['대시보드 진입', '기간/필터 선택', '지표 확인', '세부 항목 드릴다운'],
      designNotes: ['데스크톱/모바일 반응형 레이아웃 정의', '지표 새로고침 주기 결정', '권한별 노출 지표 구분'],
    },
    auth: {
      summary: `${domain} 서비스 접근을 위한 로그인/회원가입 화면.`,
      screens: [
        {
          name: '로그인 화면',
          purpose: '기존 사용자 인증',
          components: ['아이디/비번 입력', '로그인 버튼', '소셜 로그인', '가입 링크'],
        },
        { name: '회원가입 화면', purpose: '신규 계정 생성', components: ['입력 필드', '약관 동의', '가입 버튼'] },
      ],
      components: [
        { name: '입력 필드', description: '이메일/비밀번호', states: ['기본', '오류', '표시/숨김(비번)'] },
        { name: '소셜 로그인 버튼', description: '간편 인증', states: ['기본', '로딩'] },
        { name: '주요 버튼', description: '로그인/가입 전송', states: ['활성', '비활성', '로딩'] },
      ],
      userFlow: ['진입', '자격 증명 입력', '인증', '성공 시 홈 / 실패 시 오류 안내'],
      designNotes: ['비밀번호 정책/표시 토글 정의', '소셜 로그인 제공자 확정', '오류 메시지는 보안상 모호하게'],
    },
    approval: {
      summary: `${domain} 요청을 결재선에 따라 검토·승인/반려하는 워크플로우 화면.`,
      screens: [
        {
          name: '결재 화면',
          purpose: '요청 내용 확인 후 승인/반려 처리',
          components: ['결재선 표시기', '요청 정보', '의견 입력', '승인/반려 버튼'],
        },
        { name: '결재 이력', purpose: '단계별 처리 내역 조회', components: ['처리자', '처리일시', '의견'] },
      ],
      components: [
        { name: '결재선 표시기', description: '기안→검토→승인 단계와 현재 위치', states: ['대기', '진행중', '완료'] },
        { name: '승인/반려 버튼', description: '결재 처리 액션', states: ['활성', '비활성', '로딩'] },
        { name: '의견 입력', description: '반려 시 사유 필수', states: ['기본', '오류(사유 누락)'] },
      ],
      userFlow: ['결재함 진입', '요청 상세 확인', '의견 입력', '승인 또는 반려', '기안자에게 통보'],
      designNotes: ['반려 시 사유 필수 입력', '전결/대결 규정 반영', '처리 이력은 감사 대상'],
      permissions: [
        { role: '기안자(영업점 직원)', actions: '기안, 조회' },
        { role: '결재자(지점장)', actions: '조회, 승인, 반려' },
      ],
      exceptions: ['결재 권한 없음', '이미 처리된 건 재처리 시도', '반려 사유 미입력'],
      nonFunctional: ['결재 처리 이력 감사로그 보관', '결재선 규정 변경 이력 관리'],
    },
    wizard: {
      summary: `${domain} 신청/등록을 여러 단계로 나눠 순차 진행하는 마법사 화면.`,
      screens: [
        {
          name: '단계별 입력',
          purpose: '단계마다 필요한 정보 입력',
          components: ['단계 표시기', '입력 필드', '이전/다음 버튼'],
        },
        { name: '최종 확인', purpose: '입력 내용 검토 후 제출', components: ['요약', '수정 링크', '제출 버튼'] },
      ],
      components: [
        { name: '단계 표시기', description: '전체 단계 중 현재 위치', states: ['완료', '현재', '예정'] },
        { name: '입력 필드', description: '단계별 항목', states: ['기본', '오류', '비활성'] },
        { name: '이동 버튼', description: '이전/다음 단계 이동', states: ['활성', '비활성(필수 미입력)'] },
      ],
      userFlow: ['1단계 입력', '다음 단계 이동', '단계별 유효성 확인', '최종 확인', '제출'],
      designNotes: ['단계 이탈 시 입력값 임시저장', '단계별 유효성 통과해야 다음 이동', '진행률 항상 표시'],
      exceptions: ['필수 항목 미입력', '단계 중 세션 만료', '중복 신청'],
    },
    report: {
      summary: `${domain} 데이터를 조건별로 조회·집계해 표로 출력·다운로드하는 리포트 화면.`,
      screens: [
        {
          name: '리포트 조회',
          purpose: '조건 설정 후 집계 결과 확인',
          components: ['조회 조건', '집계 표', '합계 행', '내보내기 버튼'],
        },
      ],
      components: [
        { name: '조회 조건', description: '기간·지점·구분 등 필터', states: ['기본', '오류(기간 역전)'] },
        { name: '집계 표', description: '행/열 집계와 합계', states: ['데이터 있음', '데이터 없음', '로딩'] },
        { name: '내보내기', description: '엑셀/PDF/인쇄', states: ['기본', '생성중'] },
      ],
      userFlow: ['조회 조건 설정', '조회 실행', '집계 결과 확인', '엑셀/PDF 내보내기 또는 인쇄'],
      designNotes: ['대량 데이터 페이지네이션/스트리밍', '합계·소계 규칙 명시', '출력 서식 사내 표준 준수'],
      dataFields: [
        { name: '조회 기간', type: '날짜범위', required: true, rule: 'YYYY-MM-DD ~ YYYY-MM-DD' },
        { name: '지점 코드', type: '코드', required: false, rule: '3자리' },
      ],
      nonFunctional: ['대량 조회 시 3초 내 1페이지 응답', '조회 이력 감사로그'],
    },
  };

  return {
    title,
    screenType,
    domain,
    ...specsByType[screenType],
  };
}

export const ruleEngine: DesignEngine = {
  // The rule engine has no memory and never asks questions; it always designs
  // from the latest user message.
  async generate(req: GenerateRequest): Promise<EngineOutput> {
    const lastUser = [...req.messages].reverse().find((m) => m.role === 'user');
    const spec = buildSpec(lastUser?.content ?? '');
    const wireframeHtml = wrapDocument(BODY_BY_TYPE[spec.screenType](spec));
    const specMarkdown = renderSpecMarkdown(spec);
    return { mode: 'design', spec, wireframeHtml, specMarkdown };
  },
};
