// 프레임워크 없는 순수 HTML/CSS/JS를 유지하기 위한 최소한의 배포 스크립트.
// Vercel의 API_BASE_URL 환경변수 값을 js/config.js의 플레이스홀더에 그대로 심는다.
const fs = require("fs");
const path = require("path");

const target = path.join(__dirname, "js", "config.js");
const apiBaseUrl = process.env.API_BASE_URL;

if (!apiBaseUrl) {
  console.warn("API_BASE_URL 환경변수가 없어 config.js를 그대로 둡니다 (로컬 기본값 사용).");
  process.exit(0);
}

// config.js 안에는 플레이스홀더가 주석과 코드 두 곳에 나오므로 전부 치환한다.
const content = fs.readFileSync(target, "utf-8");
fs.writeFileSync(target, content.split("__API_BASE_URL__").join(apiBaseUrl));
console.log(`config.js에 API_BASE_URL=${apiBaseUrl} 적용 완료`);
