// markdown.js 자체 점검. `node scripts/check_markdown.js`
//
// XSS 방어가 이 파일의 존재 이유다. 렌더러가 innerHTML로 새어 나가는 순간 조용히
// 뚫리는데, 화면에서는 아무 차이가 없어 눈으로는 못 잡는다.

// 브라우저 없이 돌리려고 DOM을 최소한만 흉내 낸다. 진짜 DOM과 다른 점이 있으면
// 테스트가 통과해도 소용없으므로, 만든 노드의 태그·텍스트만 확인한다.
class Node {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this._text = "";
    this.className = "";
  }
  appendChild(child) {
    this.children.push(child);
    return child;
  }
  set textContent(value) {
    this._text = String(value);
    this.children = [];
  }
  get textContent() {
    return this._text + this.children.map((c) => c.textContent).join("");
  }
}

global.document = {
  createElement: (tag) => new Node(tag),
  createTextNode: (text) => {
    const n = new Node("#text");
    n.textContent = text;
    return n;
  },
  createDocumentFragment: () => new Node("#fragment"),
};
global.window = {};
require("../js/markdown.js");

function render(md) {
  const root = new Node("div");
  window.renderMarkdown(root, md);
  return root;
}

// 태그를 납작하게 편다
function tags(node, out = []) {
  for (const child of node.children) {
    if (child.tag !== "#text" && child.tag !== "#fragment") out.push(child.tag);
    tags(child, out);
  }
  return out;
}

function check(label, condition) {
  if (!condition) throw new Error(`실패: ${label}`);
  console.log(`OK  ${label}`);
}

// --- 서식 ---
check("### 제목이 h4가 된다", tags(render("### 종합 해석")).includes("h4"));
check("## 제목이 h3가 된다", tags(render("## 요약")).includes("h3"));
check("**굵게**가 strong이 된다", tags(render("이건 **중요**하다")).includes("strong"));
check("`코드`가 code가 된다", tags(render("`density` 지표")).includes("code"));
check("- 목록이 ul>li가 된다", tags(render("- 첫째\n- 둘째")).join(",") === "ul,li,li");
check("1. 목록이 ol>li가 된다", tags(render("1. 첫째\n2. 둘째")).join(",") === "ol,li,li");
check(
  "표가 thead/tbody로 갈린다",
  tags(render("| 동 | 값 |\n|---|---|\n| 중앙동 | 585 |")).join(",") ===
    "table,thead,tr,th,th,tbody,tr,td,td"
);
check("빈 줄이 문단을 가른다", tags(render("첫 문단\n\n둘째 문단")).join(",") === "p,p");
check("한 문단 안 줄바꿈은 br", tags(render("첫 줄\n둘째 줄")).join(",") === "p,br");

// --- 내용 보존 ---
check("굵게 안 글자가 남는다", render("**중앙동**").textContent === "중앙동");
check("별표는 사라진다", !render("**중앙동**").textContent.includes("*"));
check(
  "실제 답변 형태가 통째로 그려진다",
  tags(render("## 요약\n대전 상권은 완만히 늘었다.\n\n## 핵심 수치\n- 총 **80,704개**\n- 증가 +3.59%")).join(",") ===
    "h3,p,h3,ul,li,strong,li"
);

// --- XSS: 이 절이 이 파일의 핵심이다 ---
const attacks = [
  "<script>alert(1)</script>",
  "<img src=x onerror=alert(1)>",
  "**<script>alert(1)</script>**",
  "| <script>alert(1)</script> |\n|---|",
  "- <img src=x onerror=alert(1)>",
  "## <script>alert(1)</script>",
  "`<script>alert(1)</script>`",
  "<a href=javascript:alert(1)>클릭</a>",
];
for (const attack of attacks) {
  const produced = tags(render(attack));
  const dangerous = produced.filter((t) => !["p", "br", "strong", "code", "ul", "ol", "li", "table", "thead", "tbody", "tr", "th", "td", "h3", "h4", "h5", "h6"].includes(t));
  if (dangerous.length) throw new Error(`화이트리스트 밖 태그가 만들어졌다: ${dangerous} (${attack})`);
  // 공격 문자열은 그냥 글자로 남아야 한다
  if (!render(attack).textContent.includes("alert(1)") && !render(attack).textContent.includes("클릭")) {
    throw new Error(`입력이 사라졌다: ${attack}`);
  }
}
check(`공격 문자열 ${attacks.length}종이 전부 글자로만 남는다`, true);

// innerHTML을 아예 안 쓰는지 원문에서 확인한다. 위 테스트는 DOM 대역이라
// innerHTML이 섞여 들어와도 못 잡는다.
const source = require("fs")
  .readFileSync(require("path").join(__dirname, "../js/markdown.js"), "utf-8")
  // 주석에서는 innerHTML을 "안 쓴다"고 설명하고 있으므로 주석을 걷어내고 본다
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
check("innerHTML/outerHTML/insertAdjacentHTML을 쓰지 않는다", !/innerHTML|outerHTML|insertAdjacentHTML/.test(source));

console.log("\n마크다운 렌더러 점검 통과.");
