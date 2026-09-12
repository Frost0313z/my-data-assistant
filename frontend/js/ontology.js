// G그룹: 질문이 화면을 세팅한다. 스펙 docs/specs/G-ontology.md
//
// **여기에는 DOM이 없다.** 순수 함수만 둔다 — 그래야 브라우저 없이 node로 표를
// 돌려 검증할 수 있고(G7, markdown.js와 같은 방식), 같은 입력에 같은 출력이 보장된다.
// 화면을 실제로 만지는 일은 부르는 쪽(chat.js·map.js)이 한다.
//
// **G2가 먼저다.** 동작 수를 줄이는 것보다 "못 답하면 화면을 안 바꾼다"가 이 서비스의
// 정체성이다. 화면을 바꾸면 답한 척이 된다.
(function (window) {
  "use strict";

  // 사전은 부르는 쪽이 넣어 준다. 브라우저는 fetch로, node는 require로 읽어
  // 같은 함수에 먹인다 — 로딩 방식이 판정 로직에 섞이지 않게 한다.
  let dict = null;

  function load(data) {
    dict = data || null;
    return dict;
  }

  function normalizeQuery(text) {
    // 공백을 지우면 "얼마 버"가 "얼마버"도 잡는다. 한국어는 띄어쓰기가 흔들린다.
    return String(text || "").normalize("NFC").replace(/\s+/g, "");
  }

  function compact(list) {
    return (list || []).map(normalizeQuery).filter(Boolean);
  }

  // "A 말고 B"에서 빠지는 것은 **앞의 A**다. 부정어는 그 앞을 부정한다.
  //
  // 그래서 판정은 `after`로 한다. "매출 말고 교체율"에서 `before`(=매출)를 보면
  // 사용자가 이미 스스로 배제한 것을 못 알아듣고 거절하게 된다 — 스펙 G3에
  // "부정어 뒤에 붙은 말을 뺀다"고 적혀 있었는데 그건 방향이 반대였다.
  function splitNegation(text) {
    const query = normalizeQuery(text);
    const marks = compact(dict && dict.negations);
    let cut = -1;
    let markLength = 0;
    for (const mark of marks) {
      const at = query.indexOf(mark);
      if (at !== -1 && (cut === -1 || at < cut)) {
        cut = at;
        markLength = mark.length;
      }
    }
    // 부정어가 없으면 문장 전체가 "원하는 것"이다.
    if (cut === -1) return { negated: "", wanted: query, hasNegation: false };
    return {
      negated: query.slice(0, cut),
      wanted: query.slice(cut + markLength),
      hasNegation: true,
    };
  }

  // 못 답하는 질문인가. 맞으면 { id, label, message, chips }, 아니면 null.
  //
  // **사용자가 원한다고 말한 부분에서만** 찾는다. "매출 말고 교체율"은 거절이 아니다 —
  // 부분 문자열만 보면 `매출`에 걸려 거절되는데, 그건 사용자가 이미 피해 간 것을
  // 못 알아듣고 잔소리하는 것이다. 반대로 "교체율 말고 매출"은 여전히 거절이다.
  function refusalFor(text) {
    if (!dict || !dict.refuse) return null;
    const { wanted } = splitNegation(text);
    for (const rule of dict.refuse) {
      if (!compact(rule.patterns).some((p) => wanted.indexOf(p) !== -1)) continue;
      return {
        id: rule.id,
        label: rule.label,
        message: rule.message,
        chips: (rule.chips || []).slice(),
      };
    }
    return null;
  }

  const ontology = { load, refusalFor, splitNegation, normalizeQuery, get dict() { return dict; } };

  window.ontology = ontology;
  if (typeof module !== "undefined" && module.exports) module.exports = ontology;

  // 브라우저에서만 사전을 받아 온다. `document`로 가른다 — node에는 없고, 위의
  // 순수 함수들은 사전을 인자로 받으므로 검증(G7)은 이 경로를 타지 않는다.
  //
  // 실패해도 조용히 넘어간다. 사전이 없으면 `refusalFor`가 항상 null을 주고,
  // 그건 이 기능이 생기기 전과 똑같은 화면이다 — 후퇴가 아니다.
  if (typeof document !== "undefined" && typeof fetch === "function") {
    fetch("data/ontology.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && load(data))
      .catch(() => {});
  }
})(typeof window !== "undefined" ? window : globalThis);
