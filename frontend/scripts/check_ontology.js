// 온톨로지 사전 점검. `node scripts/check_ontology.js`
//
// 두 가지를 본다.
//
// **1. 사전 자체가 말이 되는가** — 질문→기대 의도 표(G7). 순수 함수라 브라우저
//    없이 돌릴 수 있다. markdown.js와 같은 방식이다.
//
// **2. 프런트의 "못 한다" 목록과 백엔드 프롬프트가 같은 말을 하는가** — 양방향으로.
//    한 방향만 보면 소용없다. *"프롬프트에 `매출`이라는 글자가 있는가"* 는 영원히
//    통과하고, 정작 위험한 쪽(**프롬프트에 한계가 새로 늘었는데 프런트가 모르는 것**)
//    을 못 잡는다. 화면과 말이 갈라지면 한쪽은 거짓말이 된다.

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const repo = path.resolve(root, "..");

global.window = {};
const ontology = require("../js/ontology.js");

const dict = JSON.parse(fs.readFileSync(path.join(root, "data/ontology.json"), "utf8"));
ontology.load(dict);

let failed = 0;
function check(name, ok, detail) {
  console.log(`${ok ? "OK " : "FAIL"} ${name}${ok || !detail ? "" : `\n     → ${detail}`}`);
  if (!ok) failed++;
}

// ── 1. 사전의 모양 ────────────────────────────────────────────────────────────
check("@context가 있다 (JSON-LD)", !!dict["@context"]);
check(
  "프로젝트 전용 용어는 @context에서 null이다",
  ["refuse", "answers", "cannot", "grain"].every((k) => dict["@context"][k] === null),
  "표준 어휘로 못 적는 말에 IRI를 지어 붙이면 열어도 아무것도 없는 주소가 생긴다"
);
check(
  "사전에 수치가 없다",
  !JSON.stringify(dict).match(/\d{2,}[.,]\d|\d{3,}/),
  "수치의 출처는 insights.md 하나다. 사전까지 세 곳이 되면 갈라진다"
);
check("거절 범주가 하나 이상 있다", (dict.refuse || []).length > 0);
check(
  "모든 거절 범주에 문구·패턴·promptTerms가 있다",
  (dict.refuse || []).every((r) => r.id && r.label && r.message && (r.patterns || []).length && (r.promptTerms || []).length)
);

// ── 2. 질문 → 기대 의도 표 ───────────────────────────────────────────────────
// 형식: [질문, 기대하는 거절 id 또는 null]
const CASES = [
  // 정상 거절
  ["이 동네 매출 얼마나 나와?", "sales"],
  ["여기서 장사 잘 되나요?", "sales"],
  ["돈 되는 업종이 뭐야", "sales"],
  ["객단가 높은 곳 알려줘", "sales"],
  ["유동인구 많은 곳은?", "footfall"],
  ["사람 많이 다니는 동네 알려줘", "footfall"],
  ["통행량 기준으로 보여줘", "footfall"],
  ["여기 월세 얼마야?", "rent"],
  ["권리금 시세 알려줘", "rent"],

  // 띄어쓰기가 흔들려도 잡는다
  ["매출이얼마나되지", "sales"],
  ["유동 인구 알려줘", "footfall"],

  // 부정어 함정 — 거절이 아니다
  ["매출 말고 교체율 보여줘", null],
  ["유동인구 빼고 업소 수만", null],
  ["매출이 아니라 점포 수 알려줘", null],
  ["임대료 대신 밀도로 보여줘", null],
  ["유동인구 없이 볼 수 있는 게 뭐야", null],

  // 부정어가 있어도 뒤에 같은 범주가 또 나오면 여전히 거절이다
  // (앞부분에서 이미 잡히므로 결과는 같다)
  ["매출 말고 매출 말이야", "sales"],

  // 데이터로 답할 수 있는 질문 — 건드리지 않는다
  ["용문동 점포 교체율은?", null],
  ["서구에서 업소가 제일 많은 동은?", null],
  ["공급 밀도 높은 곳 보여줘", null],
  ["작년보다 늘어난 동네 있어?", null],
  ["업종 구성이 다양한 곳은?", null],
  ["둔산1동 잔존율 알려줘", null],
  ["대덕구는 어때?", null],
  ["", null],
  ["ㅁㄴㅇㄹ", null],
];

let matched = 0;
const wrong = [];
for (const [question, expected] of CASES) {
  const got = ontology.refusalFor(question);
  const gotId = got ? got.id : null;
  if (gotId !== expected) wrong.push(`"${question}" → ${gotId} (기대: ${expected})`);
  if (expected) matched++;
}
check(`질문 ${CASES.length}개가 기대대로 갈린다`, wrong.length === 0, wrong.join("\n     → "));
console.log(`     커버리지: 거절 ${matched}건 / 통과 ${CASES.length - matched}건`);

// ── 3. 프런트 ↔ 백엔드 양방향 대조 ───────────────────────────────────────────
const PROMPT_SOURCES = [
  "backend/app/services/chat_service.py",
  "backend/app/seed/insights.md",
];
const promptText = PROMPT_SOURCES.map((p) => fs.readFileSync(path.join(repo, p), "utf8")).join("\n");

// 정방향: 사전이 "못 한다"고 적은 것은 프롬프트도 못 한다고 말해야 한다.
const missingInPrompt = [];
for (const rule of dict.refuse) {
  for (const term of rule.promptTerms) {
    if (!promptText.includes(term)) missingInPrompt.push(`${rule.id}: "${term}"`);
  }
}
check(
  "사전의 한계가 프롬프트에도 있다 (정방향)",
  missingInPrompt.length === 0,
  `프롬프트가 모르는 한계: ${missingInPrompt.join(", ")}`
);

// 역방향: 프롬프트가 "없다"고 말하는 것은 사전에도 범주가 있어야 한다.
// 이쪽이 진짜다 — 프롬프트에 한계를 한 줄 더 적고 프런트를 안 고치면, 화면은
// 여전히 아는 척한다. 사람이 기억해서 맞출 일이 아니다.
const claimed = new Set(dict.refuse.flatMap((r) => r.promptTerms));
const declared = new Set();
const NEGATED = [
  // "매출·유동인구 데이터가 없어" / "임대료 자료가 없어"
  /([가-힣]+(?:·[가-힣]+)*)\s*(?:데이터|자료)\s*[가는이]?\s*없/g,
  // "매출·유동인구가 없어"
  /([가-힣]+(?:·[가-힣]+)+)[가이]\s*없/g,
];
for (const pattern of NEGATED) {
  for (const m of promptText.matchAll(pattern)) {
    m[1].split("·").forEach((term) => term && declared.add(term));
  }
}
const unclaimed = [...declared].filter((t) => !claimed.has(t));
check(
  "프롬프트의 한계가 사전에도 있다 (역방향)",
  unclaimed.length === 0,
  `사전이 모르는 한계: ${unclaimed.join(", ")} — refuse 범주를 추가해야 화면도 같은 말을 한다`
);
console.log(`     프롬프트에서 읽은 한계: ${[...declared].join(", ") || "(없음)"}`);

console.log(failed ? `\n온톨로지 점검 실패 ${failed}건.` : "\n온톨로지 점검 통과.");
process.exit(failed ? 1 : 0);
