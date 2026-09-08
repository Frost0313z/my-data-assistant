// build.js가 배포 시 __API_BASE_URL__을 Vercel 환경변수 값으로 치환한다.
// 로컬 개발 중에는 아래 기본값(로컬 백엔드)이 그대로 사용된다.
const PLACEHOLDER = "__API_BASE_URL__";
window.API_BASE_URL = PLACEHOLDER.startsWith("__") ? "http://localhost:8000" : PLACEHOLDER;
