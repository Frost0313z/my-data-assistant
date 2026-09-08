// build.js가 배포 시 __API_BASE_URL__을 Vercel 환경변수 값으로 치환한다.
// 로컬 개발 중에는 아래 기본값(로컬 백엔드)이 그대로 사용된다.
const PLACEHOLDER = "__API_BASE_URL__";
window.API_BASE_URL = PLACEHOLDER.startsWith("__") ? "http://localhost:8000" : PLACEHOLDER;

// "전체 대시보드 ↗" 링크 대상 — 분석 저장소의 인터랙티브 대시보드(GitHub Pages).
// 각 주제의 anchor(#heatmapTitle 등)를 붙여 해당 섹션으로 바로 연다.
window.DASHBOARD_URL = "https://frost0313z.github.io/daejeon-commercial-analysis/interactive-dashboard.html";
