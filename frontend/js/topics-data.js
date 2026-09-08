// 분석 주제 카드 데이터. backend/app/seed/insights.md(사전 분석 리포트 고정 스냅샷)와
// 같은 출처·같은 수치를 쓴다. 여기 수치를 바꾸면 insights.md도 같이 맞출 것.
//
// row 규칙:
//   { name, pct }              → 증감률 막대 (양수 초록 / 음수 빨강, "+3.59%")
//   { name, pct, unit: "%" }   → 비율 막대 (중립 파랑, "73.7%")
//   { name, value, tone? }     → 텍스트 행 (tone: "up" | "down" 색만)
// anchor: 전체 대시보드(GitHub Pages)의 해당 섹션 id. 없으면 최상단.

window.TOPICS = [
  {
    id: "scale",
    label: "전체 규모·성장",
    anchor: "",
    headline: "77,904 → 80,704개 (+2,800, +3.59%)",
    desc: "2025-03 → 2026-06 대전 전체 등록 업소 수. 모든 자치구가 +2~4%대로 완만하게 늘었다.",
    rows: [
      { name: "2025-03 시작", value: "77,904개" },
      { name: "2026-06 종료", value: "80,704개" },
      { name: "증감", pct: 3.59 },
    ],
  },
  {
    id: "district",
    label: "자치구별 증감",
    anchor: "#barTitle",
    headline: "서구 +4.39% 최고 · 동구 +2.39% 최저",
    desc: "같은 구간 자치구별 업소 수 성장률. 격차는 2%p 안쪽으로 고르게 성장했다.",
    rows: [
      { name: "서구", pct: 4.39 },
      { name: "유성구", pct: 3.58 },
      { name: "중구", pct: 3.44 },
      { name: "대덕구", pct: 2.98 },
      { name: "동구", pct: 2.39 },
    ],
  },
  {
    id: "industry",
    label: "업종별 증감",
    anchor: "#heatmapTitle",
    headline: "부동산업 +9.8% ↑ · 음식점업 −2.1% ↓",
    desc: "업종 대분류별 성장률. 부동산·교육·개인서비스는 늘고, 음식점·임대·여가는 줄었다.",
    rows: [
      { name: "부동산업", pct: 9.8 },
      { name: "교육 서비스업", pct: 5.1 },
      { name: "수리·개인 서비스업", pct: 4.2 },
      { name: "소매업", pct: 1.7 },
      { name: "예술·스포츠·여가", pct: -0.3 },
      { name: "음식점업", pct: -2.1 },
      { name: "사업시설관리·임대", pct: -2.6 },
    ],
  },
  {
    id: "survival",
    label: "점포 잔존율",
    anchor: "#growthMapTitle",
    headline: "15개월 잔존율 73.7% (분기마다 약 −2.6%p)",
    desc: "2025-03에 있던 점포가 2026-06에도 같은 번호로 남은 비율. 행정동 평균은 약 86%.",
    rows: [
      { name: "중앙동 (최고)", pct: 90.3, unit: "%" },
      { name: "대흥동", pct: 84.9, unit: "%" },
      { name: "효동", pct: 80.1, unit: "%" },
      { name: "목동 (최저)", pct: 73.7, unit: "%" },
    ],
    note: "공급밀도 1·2위(중앙동·대흥동)가 오히려 평균 이상으로 안정적이다 — 밀도가 높다고 불안정한 건 아니다.",
  },
  {
    id: "density",
    label: "공급 밀도",
    anchor: "#mapTitle",
    headline: "동구 중앙동 585.3개 / 1,000명 (중앙값의 약 11.8배)",
    desc: "인구 1,000명당 업소 수. 원도심은 방문 수요를 상주인구로 나눠 압도적으로 높게 나온다 — 과밀이나 성공으로 단정할 수 없다.",
    rows: [
      { name: "중앙동", value: "585.3" },
      { name: "효동", value: "40.3" },
      { name: "판암1동", value: "34.1" },
      { name: "판암2동", value: "21.1" },
    ],
    note: "생활권 행정동은 대체로 20~40개 수준.",
  },
  {
    id: "lq",
    label: "업종 특화 (LQ)",
    anchor: "#scatterTitle",
    headline: "둔산1동 전문·과학·기술 서비스 LQ 3.48 + 631개",
    desc: "입지계수 LQ (1.0 = 대전 평균). 규모와 특화는 별개 정보라, 비율만으로 시장 크기를 판단하면 안 된다.",
    rows: [
      { name: "둔산1동 전문서비스", value: "LQ 3.48 · 631개 (상대·절대 모두 큼)" },
      { name: "기성동 숙박업", value: "LQ 19.2 · 35개뿐" },
      { name: "중앙동 음식점업", value: "LQ 0.73(평균 이하) · 1,000명당 125개(최다)" },
    ],
  },
  {
    id: "growth",
    label: "성장·정체 지역",
    anchor: "#growthMapTitle",
    headline: "성장: 서구 월평 · 유성 도안·테크노 / 정체: 동구 자양·효동",
    desc: "점포 수 방향 기준(매출·유동인구 미결합). 성장 지역은 두 자릿수, 정체 지역은 업소 수 제자리 + 잔존율 하위.",
    rows: [
      { name: "서구 월평 일대", value: "두 자릿수 성장", tone: "up" },
      { name: "유성구 도안·테크노(상대·구즉)", value: "두 자릿수 성장", tone: "up" },
      { name: "동구 자양동·효동", value: "정체 + 잔존율 하위", tone: "down" },
      { name: "유성구 온천2동 · 서구 복수동", value: "정체", tone: "down" },
    ],
    note: "예외: 대흥동은 밀도 2위인데 +0.4%로 멈췄고, 목동은 잔존율 최저(73.7%)인데 +5.3% 늘었다.",
  },
  {
    id: "turnover",
    label: "점포 교체율",
    anchor: "#turnoverTitle",
    headline: "대전 전체 교체율 54.7% — '제자리'여도 안에선 크게 갈린다",
    desc: "15개월간 (진입 + 이탈) ÷ 시작 업소 수. 순증이 0 근처인데 교체율이 높으면 폐업과 창업이 맞물린 상권.",
    rows: [
      { name: "복수동", pct: 67.2, unit: "%" },
      { name: "효동", pct: 66.2, unit: "%" },
      { name: "대흥동", pct: 63.7, unit: "%" },
      { name: "대전 전체", pct: 54.7, unit: "%" },
      { name: "기성동·삼성동·대화동", value: "30% 안팎 (저교체)" },
    ],
  },
];
