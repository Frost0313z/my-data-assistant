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
    return { wanted: cut === -1 ? query : query.slice(cut + markLength) };
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
      return { id: rule.id, message: rule.message, chips: (rule.chips || []).slice() };
    }
    return null;
  }

  // ── G3: 질문 → 화면 의도 ───────────────────────────────────────────────────
  //
  // **LLM을 부르지 않는다.** ① 콜드스타트 동안에도 화면이 즉시 잡힌다 ② 토큰 0
  // ③ 결정적이라 표로 테스트된다 ④ **틀리게 바꾸지 않는다** — 못 알아들으면
  // 아무것도 안 바뀌고, 그건 지금과 같은 상태라 후퇴가 아니다. LLM은 동 코드를
  // 지어낼 수 있다.
  //
  // **있는 키만 넣는다.** 못 알아들은 것은 빈 값으로 덮어쓰지 않는다 — 사용자가
  // 맞춰 둔 화면을 조용히 리셋하는 것이 이 기능의 최악의 실패다.

  // 지명은 새로 만들지 않는다. daejeon-map.json이 이미 사전이라 부르는 쪽이
  // 넣어 준다. { label, district, code, names } 목록.
  let regions = [];

  function loadRegions(list) {
    regions = Array.isArray(list) ? list : [];
  }

  function findMetric(query) {
    let best = null;
    for (const metric of dict.metrics || []) {
      for (const alias of compact(metric.aliases)) {
        const at = query.indexOf(alias);
        // 긴 별칭이 이긴다. "업종 구성"이 "구성"보다 구체적이다.
        if (at !== -1 && (!best || alias.length > best.length)) {
          best = { key: metric.key, length: alias.length };
        }
      }
    }
    return best && best.key;
  }

  function findRegion(query) {
    // 긴 이름부터 본다. "둔산1동"이 "둔산"보다, "서구 용문동"이 "서구"보다 구체적이다.
    const sorted = regions
      .flatMap((r) => (r.names || []).map((name) => ({ region: r, name: normalizeQuery(name) })))
      .filter((n) => n.name && n.name.length >= 2)
      .sort((a, b) => b.name.length - a.name.length);
    for (const { region, name } of sorted) {
      if (query.indexOf(name) !== -1) return region;
    }
    return null;
  }

  function findView(query) {
    if (query.indexOf("3d") !== -1 || query.indexOf("입체") !== -1) return "3d";
    if (query.indexOf("2d") !== -1 || query.indexOf("평면") !== -1) return "2d";
    return null;
  }

  // ── G5: 무대 선택 — 입도로 가른다 ─────────────────────────────────────────
  //
  // 지도가 답할 수 없는 질문이 있다. "서구랑 동구 중 어디가 더 안정적이야?"
  // 지도는 한 번에 한 곳만 고른다. 지금은 사용자가 탭 5개 중 무엇을 봐야
  // 하는지 스스로 알아내야 한다.
  //
  // **입도가 안 맞으면 보내지 않는다.** 히트맵은 `district×industry` 입도라
  // 행정동 질문에 답할 수 없다. 모르고 보내면 엉뚱한 탭을 열어 놓고 답한 척하게
  // 된다 — G2와 같은 실패다. 그래서 이건 편의가 아니라 정확성이다.

  // 질문이 요구하는 입도. 무엇을 묻는지가 아니라 **어떤 단위의 답**을 원하는지다.
  // "어디"는 넓지만 안전하다. 한 지역을 콕 집은 질문은 위에서 이미 지도로
  // 빠지므로("용문동 교체율은?"), 여기까지 오는 "어디"는 대체로 분포를 묻는다.
  const COMPARISON = [
    "어디", "비교", "순위", "순으로", "제일", "가장", "높은 곳", "낮은 곳", "많은 곳", "top",
    "분포", "전체적", "어느 동네", "어디들", "다 보여",
  ];

  function wantsComparison(query) {
    return COMPARISON.some((p) => query.indexOf(normalizeQuery(p)) !== -1);
  }

  function stageById(id) {
    return (dict.stages || []).find((s) => s.id === id) || null;
  }

  // 어느 무대로 보낼지. 못 보내면 왜 못 보내는지 이유를 함께 돌려준다.
  //
  // 보내지 못하는 것과 보낼 데가 없는 것은 다르다. 전자는 말해 줘야 한다.
  function chooseStage(intent, query) {
    // 한 지역을 콕 집었으면 그건 "그 지역의 값"이라 지도다. 라벨이 같아도
    // 분포를 묻는 것과는 다른 개념이다(동명이개념).
    if (intent.dong) return { stage: "map" };

    // 사용자가 입도를 직접 말했으면 그것이 가장 강한 신호다.
    const districtAsked = query.indexOf("자치구") !== -1 || query.indexOf("구별") !== -1;
    const dongAsked = query.indexOf("행정동") !== -1 || query.indexOf("동별") !== -1;

    if (!wantsComparison(query) && !districtAsked && !dongAsked) return { stage: "map" };

    // 업종이 걸린 비교는 히트맵인데, 그건 자치구 × 업종 입도다.
    const industryAsked = intent.metric === "hhi" || query.indexOf("업종") !== -1;
    if (industryAsked) {
      // **행정동 단위 업종 답은 어느 무대도 못 낸다.** 엉뚱한 탭을 열지 않는다.
      // 열어 놓으면 답한 척이 된다 — G2와 같은 실패다.
      if (dongAsked || (intent.district && query.indexOf("동") !== -1)) {
        return { stage: null, reason: "grain", wanted: "dong", have: "district×industry" };
      }
      return { stage: "industry" };
    }

    // 막대 탭은 bar 파라미터로 입도를 바꾼다(district·category·dong).
    if (districtAsked || dongAsked) return { stage: "district" };

    if (intent.metric === "turnover") return { stage: "turnover" };
    if (intent.metric === "survival" || intent.metric === "change") return { stage: "growth" };
    if (intent.metric === "stores" || intent.metric === "density") return { stage: "district" };
    return { stage: "map" };
  }

  // ── G6: 불가능한 조합 ─────────────────────────────────────────────────────
  //
  // 제약을 어기는 요청은 **화면을 어긋난 상태로 보내지 않고** 이유를 말한다.
  // 지금은 작은 안내문으로만 알리는데 읽는 사람이 거의 없다.
  //
  // ② "전 기간 지표는 시점을 못 고른다"는 이미 코드가 막고 있다
  //    (map.js의 `period.disabled = !!spec().allPeriods`). 여기서는 **사실로만
  //    적고** 다시 구현하지 않는다 — 두 벌이 되면 갈라진다.
  function constraintFor(intent, query) {
    if (!dict || !dict.constraints) return null;

    // ① 업종 점은 최신 한 시점뿐이다. 업종과 시점을 함께 요구하면 못 한다.
    const asksPeriod = ["시점", "기간", "월", "년", "작년", "재작년", "예전", "과거"].some(
      (w) => query.indexOf(normalizeQuery(w)) !== -1
    );
    if (intent.category && asksPeriod) {
      return dict.constraints.find((c) => c.id === "category-vs-period") || null;
    }

    // ② 전 기간 누적 지표에 특정 시점을 요구한 경우.
    if (intent.metric && asksPeriod) {
      const metric = (dict.metrics || []).find((m) => m.key === intent.metric);
      if (metric && metric.periods === "all") {
        return dict.constraints.find((c) => c.id === "all-period-metrics") || null;
      }
    }
    return null;
  }

  // 질문 하나를 의도 객체로. 못 알아들으면 **빈 객체**를 돌려준다.
  function resolveIntent(text) {
    const intent = {};
    if (!dict) return intent;

    const { wanted } = splitNegation(text);
    if (!wanted) return intent;

    // 거절이 먼저다. 못 답하는 질문이면 **화면을 바꿀 것을 하나도 내놓지 않는다.**
    // 여기서 지표를 하나라도 끼워 넣으면 그게 바로 "답한 척"이다.
    const refusal = refusalFor(text);
    if (refusal) return { refusal: refusal.id };

    const metric = findMetric(wanted);
    if (metric) intent.metric = metric;

    const region = findRegion(wanted);
    if (region) {
      // 자치구만 잡혔으면 자치구만, 행정동이면 둘 다. 말하지 않은 것은 넣지 않는다.
      if (region.district) intent.district = region.district;
      if (region.code) intent.dong = region.code;
      intent.regionLabel = region.label;
    }

    const view = findView(wanted);
    if (view) intent.view = view;

    // G5: 어느 무대인가. 지도면 굳이 적지 않는다 — 기본이 지도라 적으면
    // "말한 것만 바꾼다"를 어기고 분석 탭에 있던 사용자를 끌어내린다.
    const choice = chooseStage(intent, wanted);
    if (choice.stage && choice.stage !== "map") intent.stage = choice.stage;
    if (choice.reason === "grain") {
      // 답할 수 없다. **무대를 바꾸지 않고** 왜 못 하는지만 남긴다.
      return { grainMismatch: { wanted: choice.wanted, have: choice.have } };
    }

    // G8: 탭을 열 거라면 파라미터까지 맞춘다. 탭만 열고 기본 정렬로 두면
    // 사용자가 다시 손봐야 한다. **계약 안의 값만** 쓴다 — 없는 값을 넣으면
    // 저쪽이 조용히 무시해서 "맞춰졌다"고 믿게 된다.
    if (intent.stage) {
      const params = stageParams(intent.stage, wanted);
      if (params) intent.params = params;
    }

    // G6: 불가능한 조합이면 화면을 어긋난 채로 보내지 않는다.
    const blocked = constraintFor(intent, wanted);
    if (blocked) {
      // 지표까지는 맞춰 준다. 못 하는 것은 시점뿐이므로 전부 버리면 과하다.
      return { metric: intent.metric, regionLabel: intent.regionLabel, constraint: blocked.message };
    }

    return intent;
  }

  // ── G8: 탭 파라미터 ────────────────────────────────────────────────────────
  //
  // 임베드 대시보드는 우리 것이 아니다. 받는 값은 저쪽이 정한 계약이고
  // **틀린 값은 에러 없이 무시된다** — 그래서 사전의 `accepts`에 있는 값만 쓴다.
  function stageParams(stageId, query) {
    const stage = stageById(stageId);
    if (!stage || !stage.accepts) return null;
    const params = {};

    const sortable = stage.accepts.sort || [];
    if (sortable.includes("growth") && (query.indexOf("증감률") !== -1 || query.indexOf("비율") !== -1)) {
      params.sort = "growth";
    } else if (sortable.includes("change") && (query.indexOf("증감량") !== -1 || query.indexOf("개수") !== -1)) {
      params.sort = "change";
    }

    const barable = stage.accepts.bar || [];
    if (barable.includes("dong") && query.indexOf("행정동") !== -1) params.bar = "dong";
    else if (barable.includes("category") && query.indexOf("업종") !== -1) params.bar = "category";

    return Object.keys(params).length ? params : null;
  }

  // 밖으로 내보내는 것은 실제로 불리는 것만. 나머지는 이 파일 안에서만 쓴다 —
  // 내보내 두면 "언젠가 쓸지도"가 되어 지울 수 없는 표면이 된다.
  const ontology = {
    load,
    loadRegions,
    refusalFor,
    resolveIntent,
    stageById,
    get dict() { return dict; },
  };

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
