import type { BranchType } from "@/api/mindmap";

// 랜딩 예시 — 2026-11-12 운영(newlearn.io.kr) 응답을 그대로 옮긴 고정 예시다. 랜딩은 API 를 부르지 않는다(발표 때 늘 같은 화면, 손님 첫 화면이 빠르게).
// 받은 곳: 띠 A7 `/articles`, 이슈 A3 · A4 `/issues/80` · `/timeline`, 사건 A5 · A6 `/events/1450` · `/articles`, 기사 A8 · A9 `/articles/55961` · `/mindmap`.
// 언론사 이름은 수집 원본 그대로인 곳(「Kbs 뉴스」 같은)을 빼고 바른 곳만 골랐다. 띠는 정치 분야 기사와 사건 사고 · 의혹 기사를 뺐다
// (국제 분야의 외국 정치 기사 · 경찰청장 내정 같은 사회 기사는 남았다)

/** 기사 제목 띠 — 운영 최신 기사 28건 */
export const HEADLINES: readonly { publisher: string; title: string }[] = [
  {
    publisher: "연합뉴스TV",
    title: 'LH "공공이 개발사업 시행하면 속도 빨라지고 부정부패 줄어"',
  },
  {
    publisher: "경향신문",
    title: "4주 연속 이어진 ‘프랑스 주말 시위’···수는 줄어도 목소리는 그대로",
  },
  {
    publisher: "메디컬투데이",
    title: "여주 산란계 농장서 고병원성 조류인플루엔자 확진",
  },
  {
    publisher: "제민일보",
    title: "오픈AI, 미국 AI 인프라 투자 강행…지역 규제 장벽 넘을까",
  },
  {
    publisher: "세계일보",
    title: "미래에셋證, 연이틀 해킹 공격… 3.9만명 정보 유출",
  },
  {
    publisher: "파이낸셜뉴스",
    title: "투표 열기가 美중간선거서 민주당 압승 이끌어",
  },
  {
    publisher: "메디컬투데이",
    title: "포스코 노사, 가까스로 잠정합의했지만…조합원 투표서 부결",
  },
  { publisher: "경향신문", title: "‘빚투족’ 9일부터 반대매매 숨통" },
  {
    publisher: "중앙일보",
    title: "네타냐후 밀어낼까…이스라엘 새 총리 향한 정적의 ‘42일 승부’",
  },
  {
    publisher: "매일경제",
    title: "소방 장비·시설 확충에 미래기금 등 활용 검토",
  },
  {
    publisher: "경인일보",
    title: "미국 AI 규제 불똥… 인천 반도체·로봇주 덮쳤다",
  },
  {
    publisher: "강원도민일보",
    title: "미 중간선거 민주당 압승 뒤엔 높은 투표율…100여년 만에 두 번째",
  },
  {
    publisher: "이투데이",
    title: "포스코 임단협 51.69% 반대로 부결…연내 타결 불투명",
  },
  {
    publisher: "파이낸셜뉴스",
    title: "젠슨 황 장녀 방한 취소… 배경훈 부총리 면담 불발",
  },
  {
    publisher: "연합뉴스TV",
    title: "이스라엘 야권 리더에 연정구성권…네타냐후 실각 위기",
  },
  {
    publisher: "뉴스핌",
    title: "유럽 대형마트 '냉동고 연쇄 해킹'에… 韓 정부도 보안 점검",
  },
  {
    publisher: "아시아경제",
    title: "갤럭시 긴장하라더니 '역대급 굴욕'…화면 깨지고 AS까지 난리난 아이폰",
  },
  {
    publisher: "연합뉴스TV",
    title: '美 중간선거 투표율 49%…"투표 열기가 민주당 압승으로"',
  },
  {
    publisher: "뉴스1",
    title: "유럽 덮친 '냉장고 해킹'에 韓도 보안점검…피해 접수 0건",
  },
  {
    publisher: "경향신문",
    title: "공공도 민간도 재개발 더딘데···‘주도권 다툼’에 매몰된 정부·서울시",
  },
  {
    publisher: "연합뉴스TV",
    title: '프랑스 전역서 4주째 주말 시위…"고물가 항의"',
  },
  {
    publisher: "세계일보",
    title: "‘23개월 공백’ 경찰청장 내정된 김종철… 조직 재정비 시험대",
  },
  { publisher: "세계일보", title: "‘반도체 투톱 쏠림’ 한계 드러낸 韓증시" },
  {
    publisher: "연합뉴스TV",
    title: '추가 인적개편 선 그은 트럼프 "우리 내각 훌륭"',
  },
  {
    publisher: "뉴스1",
    title: "25만 마리 매몰했는데 주변엔 363만 마리…여주 AI 방역 '초비상'",
  },
  {
    publisher: "파이낸셜뉴스",
    title: 'LH, 서울시 공공재개발 비판에 재반박…"부정부패 소지 없다"',
  },
  {
    publisher: "연합뉴스TV",
    title: '젤렌스키 "北 미사일, 우크라 공격에 사용"',
  },
  {
    publisher: "연합뉴스TV",
    title: "'입동' 추위 서울 첫얼음…오늘 중부 비·강원 눈",
  },
];

/** 이슈 80 — 스크롤 연출의 이슈 */
export const SAMPLE_ISSUE = {
  id: 80,
  title: "바이낸스 해킹과 북한 배후 조사",
  articleCount: 354,
  eventCount: 12,
  /** 이슈 요약(AI 생성) — 금액이 기사마다 달라 금액이 없는 이 요약을 근거와 신뢰 03 칸에 쓴다 */
  summary:
    "10월 30일 바이낸스가 해킹을 당해 가상자산을 도난당했다는 주장이 제기됐고, 국내 거래소들은 바이낸스 출금에 주의하라고 공지했다. 바이낸스는 이용자 피해를 보상하겠다고 밝혔으며, FBI는 북한을 배후로 지목하고 미 연방 수사기관은 조사에 착수했다. 바이낸스는 피해 자산의 90%를 보충하고 자체 조사 결과를 공개했으며, 탈취 자산 일부가 다른 블록체인으로 이동했다. 11월 8일 바이낸스는 해킹 피해 일주일여 만에 최고재무책임자를 교체했다.",
} as const;

export type SampleEvent = {
  id: number;
  /** 타임라인 라벨 */
  label: string;
  title: string;
  lane: "MAIN" | "SUB";
  occurredAt: string;
  articleCount: number;
};

/** 이슈 80 의 사건 12개 — 발생 시점 순 */
export const SAMPLE_EVENTS: readonly SampleEvent[] = [
  {
    id: 1444,
    label: "3% 하락",
    title: "비트코인 3.12% 하락",
    lane: "MAIN",
    occurredAt: "2026-10-30T08:22:00+09:00",
    articleCount: 12,
  },
  {
    id: 1450,
    label: "17억달러 해킹",
    title: "바이낸스 가상자산 해킹 발생",
    lane: "MAIN",
    occurredAt: "2026-10-30T08:59:28+09:00",
    articleCount: 87,
  },
  {
    id: 1467,
    label: "출금 주의 공지",
    title: "국내 거래소들, 바이낸스 출금 주의 공지",
    lane: "SUB",
    occurredAt: "2026-10-30T10:57:04+09:00",
    articleCount: 8,
  },
  {
    id: 1518,
    label: "전액 보상 발표",
    title: "바이낸스, 해킹 피해 전액 보상 방침 발표",
    lane: "MAIN",
    occurredAt: "2026-10-31T00:00:00+09:00",
    articleCount: 12,
  },
  {
    id: 1538,
    label: "대북 논의 의사",
    title: "트럼프, 북한 연루 확인 시 바이낸스 해킹 논의 의사 표명",
    lane: "SUB",
    occurredAt: "2026-10-31T00:00:00+09:00",
    articleCount: 21,
  },
  {
    id: 1540,
    label: "배후 공식 지목",
    title: "FBI, 바이낸스 해킹 배후로 북한 지목",
    lane: "MAIN",
    occurredAt: "2026-10-31T00:00:00+09:00",
    articleCount: 76,
  },
  {
    id: 1500,
    label: "수사 공조 착수",
    title: "FBI·비밀경호국 바이낸스 해킹 조사 착수",
    lane: "MAIN",
    occurredAt: "2026-10-31T02:13:27+09:00",
    articleCount: 34,
  },
  {
    id: 1501,
    label: "북한 연루설",
    title: "미 언론, 북한 조직의 바이낸스 해킹 관여 가능성 제기",
    lane: "SUB",
    occurredAt: "2026-10-31T02:23:00+09:00",
    articleCount: 23,
  },
  {
    id: 1553,
    label: "90% 보충",
    title: "바이낸스, 해킹 피해 자산 90% 보충",
    lane: "MAIN",
    occurredAt: "2026-11-01T11:39:21+09:00",
    articleCount: 31,
  },
  {
    id: 1670,
    label: "조사 결과 공개",
    title: "바이낸스, 해킹 자체 조사 결과 공개",
    lane: "MAIN",
    occurredAt: "2026-11-03T00:00:00+09:00",
    articleCount: 28,
  },
  {
    id: 1614,
    label: "2차 세탁 착수",
    title: "북한 해커들, 탈취 가상자산 솔라나로 이동",
    lane: "MAIN",
    occurredAt: "2026-11-03T04:54:46+09:00",
    articleCount: 16,
  },
  {
    id: 1876,
    label: "CFO 교체",
    title: "바이낸스 CFO 교체",
    lane: "MAIN",
    occurredAt: "2026-11-08T05:35:38+09:00",
    articleCount: 6,
  },
];

/** 사건 1450 — 기사가 가장 많은 사건 */
export const SAMPLE_EVENT = {
  id: 1450,
  title: "바이낸스 가상자산 해킹 발생",
  label: "17억달러 해킹",
  occurredAt: "2026-10-30T08:59:28+09:00",
  summary:
    "바이낸스가 해킹 공격을 받아 가상자산을 도난당했다는 주장이 나왔으며, 피해 규모는 17억달러로 알려졌다.",
  articleCount: 87,
} as const;

/** 사건 1450 의 기사 다섯 — 발행 순, 언론사가 겹치지 않게 */
export const SAMPLE_EVENT_ARTICLES: readonly {
  id: number;
  publisher: string;
  publishedAt: string;
  title: string;
}[] = [
  {
    id: 52510,
    publisher: "파이낸셜뉴스",
    publishedAt: "2026-10-30T08:59:28+09:00",
    title: "세계 최대 가상자산 거래소 바이낸스, 17억달러 해킹 피해",
  },
  {
    id: 54326,
    publisher: "뉴스1",
    publishedAt: "2026-10-30T11:52:16+09:00",
    title: "바이낸스, 8.4조 규모 해킹 당했다…가상자산 업계 역대 최대",
  },
  {
    id: 54729,
    publisher: "아주경제",
    publishedAt: "2026-10-30T13:36:38+09:00",
    title: "바이낸스 8조4000억 해킹 피해…국내 거래소도 출금 주의보",
  },
  {
    id: 54946,
    publisher: "세계일보",
    publishedAt: "2026-10-30T13:55:20+09:00",
    title:
      "세계최대 가상화폐 거래소 ‘바이낸스’ 7조원대 해킹... 전문가 북한 해커그룹 소행 추정",
  },
  {
    id: 55370,
    publisher: "매일신문",
    publishedAt: "2026-10-30T14:51:09+09:00",
    title:
      "'8조4천억' 규모 사상 초유 바이낸스 해킹…글로벌 가상자산·금융 보안망 '비상'",
  },
];

/** 기사 55961 — 흐름지도 · 마인드맵 미리보기 */
export const SAMPLE_ARTICLE = {
  id: 55961,
  title: "세계 최대 가상통화 거래소, 8조원대 해킹 피해···북한 배후설 제기",
  publisher: "경향신문",
  publishedAt: "2026-10-30T15:55:00+09:00",
} as const;

/** 기사 55961 의 마인드맵 — 가지마다 잎 둘까지 */
export const SAMPLE_BRANCHES: readonly {
  type: BranchType;
  items: readonly string[];
}[] = [
  {
    type: "CORE",
    items: [
      "바이낸스, 해킹으로 약 63억달러 피해",
      "바이낸스, 해킹 관련 가상자산 약 30억달러 동결",
    ],
  },
  {
    type: "CAUSE",
    items: [
      "공격자가 해킹된 엔지니어 노트북으로 서비스 컨테이너에 접근했을 가능성",
    ],
  },
  {
    type: "REACTION",
    items: [
      "바이낸스: 손실은 보험기금·회사 자금으로 보전 예정이며 사용자 자금은 안전",
      "TRM랩스: 사상 최대 규모 탈취 사건이며 북한이 공격 주도한 것으로 분석",
    ],
  },
  {
    type: "OUTLOOK",
    items: [
      "잇따른 보안 침해로 가상자산 시장 투자심리 위축 전망",
      "민주당이 의회 다수당 탈환 시 트럼프의 가상자산 규제 완화에 제동 관측",
    ],
  },
];
