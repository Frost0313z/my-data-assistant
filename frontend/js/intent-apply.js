// G4: 의도를 화면에 적용하고, 바꾼 것을 말하고, 되돌릴 길을 준다.
//
// 여기가 유일하게 화면을 만지는 자리다. 판정은 ontology.js(순수 함수)가 하고
// 여기서는 그 결과를 받아 셀렉트와 지도에 옮긴다.
//
// **세 가지가 선택이 아니라 전제다.**
// ① 말한 것만 바꾼다 — 지정하지 않은 셀렉트는 값이 유지된다.
// ② 바꿨으면 말한다 — 화면이 말없이 움직이면 혼란스럽다(A30).
// ③ 되돌릴 수 있다 — 이건 이해가 아니라 패턴 매칭이라 틀릴 수 있고,
//    틀렸을 때 빠져나갈 길이 없으면 안 쓰느니만 못하다.
(function (window) {
  "use strict";

  const METRIC_LABELS = {};

  function labelOf(key) {
    if (METRIC_LABELS[key]) return METRIC_LABELS[key];
    const dict = window.ontology && window.ontology.dict;
    const found = ((dict && dict.metrics) || []).find((m) => m.key === key);
    return found ? found.label : key;
  }

  // 적용한 것을 사람 말로. "교체율 · 서구 용문동"
  function describe(intent) {
    const parts = [];
    if (intent.metric) parts.push(labelOf(intent.metric));
    if (intent.regionLabel) parts.push(intent.regionLabel);
    if (intent.view) parts.push(intent.view.toUpperCase());
    return parts.join(" · ");
  }

  // 화면에 옮길 것이 실제로 있는가. regionLabel은 설명용이라 세지 않는다.
  function isEmpty(intent) {
    return !intent || !(intent.metric || intent.district || intent.dong || intent.view);
  }

  function applyIntent(intent, options) {
    const opts = options || {};
    if (isEmpty(intent)) return null;

    // 지도가 아직 없으면(콜드스타트) 큐에 둔다. 뜬 뒤에 반영된다.
    if (typeof window.applyMapState !== "function") {
      window.pendingMapState = Object.assign({}, window.pendingMapState, intent);
      return null;
    }
    // 지도 로드가 실패해 폴백 화면이면 "지도를 맞췄습니다"가 거짓말이 된다.
    if (window.mapReady === false) return null;

    const before = window.readMapState();
    window.applyMapState(intent);
    // 무대가 분석 탭이면 지도가 안 보인다. 바꿔 놓고 안 보여 주면 의미가 없다.
    if (window.focusMapStage) window.focusMapStage();

    const summary = describe(intent);
    if (!opts.silent && summary) announce(summary, before);
    return before;
  }

  // 바뀐 것을 채팅 흐름에 한 줄로 남기고 되돌리기 버튼을 붙인다.
  function announce(summary, before) {
    const list = document.getElementById("chat-messages");
    if (!list) return;

    const wrap = document.createElement("div");
    wrap.className = "intent-note";

    const text = document.createElement("span");
    // 사용자 입력에서 온 문자열이 화면으로 되돌아 나오는 자리다. textContent만 쓴다.
    text.textContent = `지도를 ${summary}(으)로 맞췄습니다`;
    wrap.appendChild(text);

    const undo = document.createElement("button");
    undo.type = "button";
    undo.className = "intent-undo";
    undo.textContent = "되돌리기";
    undo.addEventListener("click", () => {
      window.applyMapState(before);
      // 되돌린 뒤에도 안내가 남아 있으면 지금 상태를 잘못 설명하게 된다.
      wrap.remove();
    });
    wrap.appendChild(undo);

    list.appendChild(wrap);
    list.scrollTop = list.scrollHeight;

    // F1: 스크린리더에게도 알린다. 이미 role="status"인 자리를 쓴다.
    const feedback = document.getElementById("map-search-feedback");
    if (feedback) {
      feedback.textContent = `지도를 ${summary}(으)로 맞췄습니다`;
      feedback.classList.add("sr-only");
    }
  }

  window.applyIntent = applyIntent;
  window.describeIntent = describe;
})(window);
