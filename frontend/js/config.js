// build.js가 배포 시 __API_BASE_URL__을 Vercel 환경변수 값으로 치환한다.
// 로컬 개발 중에는 아래 기본값(로컬 백엔드)이 그대로 사용된다.
const PLACEHOLDER = "__API_BASE_URL__";
window.API_BASE_URL = PLACEHOLDER.startsWith("__") ? "http://localhost:8000" : PLACEHOLDER;

// 중앙에 임베드할 대전 상권 인터랙티브 대시보드 (분석 저장소 GitHub Pages 산출물).
// origin은 postMessage 수신 검증(화이트리스트)에 쓰므로 정확히 맞춰야 한다.
window.DASHBOARD_URL = "https://frost0313z.github.io/daejeon-commercial-analysis/interactive-dashboard.html";
window.DASHBOARD_ORIGIN = "https://frost0313z.github.io";
