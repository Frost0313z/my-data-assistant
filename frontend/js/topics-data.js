// 분석 주제 데이터. 수치·문구는 backend/app/seed/insights.md(사전 분석 리포트 고정 스냅샷)와
// 같은 출처를 쓴다. 여기 수치를 바꾸면 insights.md도 같이 맞출 것.
//
// embed: 실제 대시보드(GitHub Pages)를 "섹션만 보기" 모드로 띄우는 쿼리.
//   only=<data-section>[,..]  표시할 섹션 (stats·map·heatmap·growth·turnover·series·bar·table)
//   metric / category / bar / sort / series  해당 섹션 셀렉트 프리셋
// anchor: "전체 대시보드에서 보기" 링크가 열릴 섹션 id.

window.TOPICS = [
  {
    id: "scale",
    label: "전체 규모·성장",
    embed: "only=stats,series&series=city",
    anchor: "",
    headline: "77,904 → 80,704개 (+2,800, +3.59%)",
    desc: "2025-03 → 2026-06 대전 전체 등록 업소 수. 위 카드는 슬라이더로 고른 두 시점의 비교, 아래 선 그래프는 6개 관측 시점 추이.",
  },
  {
    id: "district",
    label: "자치구별 증감",
    embed: "only=bar&bar=district&sort=growth",
    anchor: "#barTitle",
    headline: "서구 +4.39% 최고 · 동구 +2.39% 최저",
    desc: "자치구별 업소 수 증감 막대. 격차는 2%p 안쪽으로 고르게 성장했다. 정렬·방향은 그래프 옆에서 바꿀 수 있다.",
  },
  {
    id: "industry",
    label: "업종별 증감",
    embed: "only=heatmap",
    anchor: "#heatmapTitle",
    headline: "부동산업 +9.8% ↑ · 음식점업 −2.1% ↓",
    desc: "자치구 × 업종 증감률 히트맵. 부동산·교육·개인서비스는 늘고, 음식점·임대·여가는 줄었다. 칸에 마우스를 올리면 수치가 보인다.",
  },
  {
    id: "growth",
    label: "성장·정체 지역",
    embed: "only=growth",
    anchor: "#growthMapTitle",
    headline: "성장: 서구 월평 · 유성 도안·테크노 / 정체: 동구 자양·효동",
    desc: "가로축 업소 수 증감률 × 세로축 잔존율 산점도. 오른쪽 위(부흥)일수록 늘고 잘 남는 상권, 왼쪽 아래(위축)일수록 줄고 교체도 빠른 상권. 점포 수 방향 기준(매출·유동인구 미결합).",
    note: "예외: 대흥동은 밀도 2위인데 +0.4%로 멈췄고, 목동은 잔존율 최저(73.7%)인데 +5.3% 늘었다.",
  },
  {
    id: "turnover",
    label: "점포 교체율",
    embed: "only=turnover",
    anchor: "#turnoverTitle",
    headline: "대전 전체 교체율 54.7% — '제자리'여도 안에선 크게 갈린다",
    desc: "가로축 순증감률 × 세로축 교체율 산점도. 15개월간 (진입 + 이탈) ÷ 시작 업소 수. 순증이 0 근처인데 위쪽이면 폐업과 창업이 맞물린 상권.",
    note: "고교체: 복수동 67.2%, 효동 66.2%, 대흥동 63.7%. 저교체: 기성동·삼성동·대화동 30% 안팎.",
  },
];
