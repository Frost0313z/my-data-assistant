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

// ── 1b. G1 사전이 코드와 같은 것을 가리키는가 ────────────────────────────────
const mapSource = fs.readFileSync(path.join(root, "js/map.js"), "utf8");
const topicsData = fs.readFileSync(path.join(root, "js/topics-data.js"), "utf8");
const topicsSource = fs.readFileSync(path.join(root, "js/topics.js"), "utf8");

// 지도 지표: map.js의 METRICS 블록에서 키와 라벨을 읽어 사전과 맞춘다.
const metricBlock = mapSource.slice(mapSource.indexOf("const METRICS = {"));
const codeMetrics = {};
for (const m of metricBlock.slice(0, metricBlock.indexOf("\n  };")).matchAll(
  /^\s{4}(\w+):\s*\{\s*\n\s*label:\s*"([^"]+)"/gm
)) {
  codeMetrics[m[1]] = m[2];
}
const dictMetrics = Object.fromEntries((dict.metrics || []).map((m) => [m.key, m.label]));
check(
  `지표 ${Object.keys(codeMetrics).length}종이 map.js와 키·라벨까지 같다`,
  JSON.stringify(codeMetrics) === JSON.stringify(dictMetrics),
  `코드 ${JSON.stringify(codeMetrics)}\n     → 사전 ${JSON.stringify(dictMetrics)}`
);
check(
  "모든 지표에 grain·periods·answers·cannot이 있다",
  (dict.metrics || []).every((m) => m.grain && m.periods && m.answers && (m.cannot || []).length && (m.aliases || []).length)
);
check(
  "periods는 single 또는 all이고, all은 map.js의 allPeriods와 일치한다",
  (dict.metrics || []).every((m) => {
    if (!["single", "all"].includes(m.periods)) return false;
    const declared = new RegExp(`${m.key}:\\s*\\{[^}]*allPeriods:\\s*true`, "s").test(metricBlock);
    return declared === (m.periods === "all");
  }),
  "교체율·증감은 전 기간 누적이라 시점을 고를 수 없다. 사전과 코드가 갈라지면 G6가 거짓말을 한다"
);

// 무대: topics-data.js의 TOPICS 5개가 전부 사전에 있어야 한다.
const codeStages = [...topicsData.matchAll(/^\s*id:\s*"(\w+)",/gm)].map((m) => m[1]);
const dictStages = (dict.stages || []).map((s) => s.id);
check(
  `대시보드 탭 ${codeStages.length}개가 전부 사전에 있다`,
  codeStages.every((id) => dictStages.includes(id)),
  `사전에 없는 탭: ${codeStages.filter((id) => !dictStages.includes(id)).join(", ")}`
);
check(
  "지도도 무대로 들어 있다",
  dictStages.includes("map"),
  "무대가 둘이라는 것이 이 사전의 전제다"
);
check(
  "모든 무대에 grain·accepts·answers·cannot이 있다",
  (dict.stages || []).every((s) => s.grain && s.accepts && s.answers && (s.cannot || []).length)
);
check(
  "embed 문자열이 topics-data.js의 것과 같다",
  (dict.stages || []).filter((s) => s.embed).every((s) => topicsData.includes(s.embed)),
  "여기가 갈라지면 사전이 열리지도 않는 화면을 설명하게 된다"
);

// 동명이개념: 같은 라벨이 두 무대에서 다른 것을 가리키면 양쪽에 표시가 있어야 한다.
const crossMarked = (dict.metrics || []).filter((m) => m.sameLabelAs).map((m) => m.key);
check(
  "동명이개념이 양쪽에 표시돼 있다",
  crossMarked.length > 0 &&
    crossMarked.every((key) => (dict.stages || []).some((s) => s.id === key && s.sameLabelAs)),
  "지도의 `점포 교체율`(코로플레스)과 교체율 탭(산점도)은 다른 개념이다"
);

// 페르소나 → 기본 지표. 사전이 기준이고 topics.js가 따라간다.
//
// **왜 코드를 사전에서 읽게 하지 않는가**: 페르소나 복원은 부팅 때 돈다. 사전을
// fetch로 받아 오면 그 전에 복원이 끝나 버려 화면이 한 번 흔들린다. 그래서 값은
// topics.js에 두고 **사전을 기준으로 CI가 대조**한다. 갈라지면 빌드가 깨진다.
const codePersonas = {};
for (const m of topicsSource.matchAll(/id:\s*"(\w+)",[\s\S]{0,400}?mapMetric:\s*"(\w+)"/g)) {
  codePersonas[m[1]] = m[2];
}
check(
  "페르소나 기본 지표가 topics.js와 같다",
  JSON.stringify(codePersonas) === JSON.stringify(dict.personas || {}),
  `코드 ${JSON.stringify(codePersonas)}\n     → 사전 ${JSON.stringify(dict.personas)}`
);
check(
  "페르소나가 가리키는 지표가 실재한다",
  Object.values(dict.personas || {}).every((key) => key in dictMetrics)
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
check(`거절 판정 ${CASES.length}문항이 기대대로 갈린다`, wrong.length === 0, wrong.join("\n     → "));

// ── 2b. G3 의도 해석 표 ──────────────────────────────────────────────────────
// 지명은 실제 경계 데이터에서 만든다. 여기서 따로 목록을 쓰면 두 벌이 되어
// 검증이 "내가 쓴 것과 내가 쓴 것"을 비교하게 된다.
const mapData = JSON.parse(fs.readFileSync(path.join(root, "data/daejeon-map.json"), "utf8"));
const regionList = [
  { label: "대전 전체", district: "", code: "", names: ["대전 전체", "전체"] },
  ...mapData.districts.features.map(({ properties: p }) => ({
    label: p.district, district: p.district, code: "", names: [p.district],
  })),
  ...mapData.boundaries.features.map(({ properties: p }) => ({
    label: `${p.district} ${p.dong}`, district: p.district, code: p.dong_code,
    names: [p.dong, `${p.district} ${p.dong}`],
  })),
];
ontology.loadRegions(regionList);
check(`지명 ${regionList.length}개를 경계 데이터에서 읽었다`, regionList.length > 80);

// 형식: [질문, 기대 의도] — 적어야 하는 키만 적는다. undefined는 "없어야 한다".
const INTENTS = [
  // 지표만
  ["교체율 보여줘", { metric: "turnover" }],
  ["공급 밀도가 궁금해", { metric: "density" }],
  ["업소가 몇 개야?", { metric: "stores" }],

  // 지명만 — 지표는 건드리지 않는다
  ["대덕구는?", { district: "대덕구" }],
  ["용문동 어때?", { district: "서구", dong: "30170550" }],

  // 지표 + 지명
  ["용문동 점포 교체율은?", { metric: "turnover", district: "서구", dong: "30170550" }],
  ["유성구 잔존율 알려줘", { metric: "survival", district: "유성구" }],

  // 한국어 활용형 — 어간 분석기 없이 별칭 나열로 감당한다
  ["여기 가게 많이 망했어?", { metric: "turnover" }],
  // 위 문항 때문에 density에서 "가게 많"·"업소 많"을 뺐다. "가게 많이 망했어"를
  // 밀도로 읽어 버렸기 때문이다. 그 대가로 아래가 안 잡히는데, **틀린 화면을
  // 띄우는 별칭은 없는 별칭보다 나쁘다** — 안 잡히면 지금과 같은 상태일 뿐이다.
  ["가게 많은 동네가 어디야", {}],
  ["망해서 문 닫는 데 많아?", { metric: "turnover" }],
  ["오래 버티는 동네가 어디야", { metric: "survival" }],
  ["업소가 늘었나 줄었나", { metric: "change" }],

  // 보기 방식
  ["3d로 보여줘", { view: "3d" }],

  // 부정어 — 부정된 쪽이 아니라 원한 쪽을 잡는다
  ["매출 말고 교체율 보여줘", { metric: "turnover" }],
  ["유동인구 빼고 업소 수만", { metric: "stores" }],

  // 거절 — 화면을 바꿀 키를 **하나도** 내놓지 않는다
  ["용문동 매출 얼마야?", { refusal: "sales" }],
  ["유동인구 많은 동네 보여줘", { refusal: "footfall" }],

  // 모호 — 빈 객체
  ["안녕", {}],
  ["", {}],
  ["그래서 결론이 뭐야", {}],
  ["작년보다 나아진 동네", {}],
];

const intentWrong = [];
let resolved = 0;
for (const [question, expected] of INTENTS) {
  const got = ontology.resolveIntent(question);
  const seen = Object.assign({}, got);
  delete seen.regionLabel; // 설명용이라 기대값에 적지 않는다
  if (JSON.stringify(seen) !== JSON.stringify(expected)) {
    intentWrong.push(`"${question}" → ${JSON.stringify(seen)} (기대: ${JSON.stringify(expected)})`);
  }
  if (Object.keys(expected).length) resolved++;
}
check(`의도 해석 ${INTENTS.length}문항이 기대대로 나온다`, intentWrong.length === 0, intentWrong.join("\n     → "));

check(
  "거절된 질문은 화면을 바꿀 키를 하나도 내놓지 않는다",
  INTENTS.filter(([, e]) => e.refusal).every(([q]) => {
    const got = ontology.resolveIntent(q);
    return !got.metric && !got.district && !got.dong && !got.view;
  }),
  "지표를 하나라도 끼워 넣으면 그게 바로 답한 척이다"
);

check(
  "같은 입력에 항상 같은 출력이다 (순수 함수)",
  INTENTS.every(([q]) => JSON.stringify(ontology.resolveIntent(q)) === JSON.stringify(ontology.resolveIntent(q)))
);

const total = CASES.length + INTENTS.length;
console.log(
  `     커버리지: 표 ${total}문항 · 거절 ${matched}건 · 의도 생성 ${resolved}건 · ` +
    `아무것도 안 함 ${total - matched - resolved}건`
);

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
