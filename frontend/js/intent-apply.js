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

  function labelOf(key) {
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
    return !intent || !(intent.metric || intent.district || intent.dong || intent.view || intent.stage);
  }

  function applyIntent(intent) {
    // G5: 입도가 안 맞으면 **무대를 바꾸지 않고** 왜 못 하는지 말한다.
    // 엉뚱한 탭을 열어 놓고 답한 척하는 것이 여기서 막는 실패다.
    if (intent && intent.grainMismatch) {
      note("이 질문은 지금 화면으로 답할 수 없어 화면을 바꾸지 않았습니다. " +
        "업종별 증감은 자치구 단위로만 있어서 행정동 단위로는 낼 수 없습니다.");
      return null;
    }

    // G6: 불가능한 조합. 지표까지는 맞추되 **왜 나머지를 안 했는지** 말한다.
    // 지금은 작은 안내문으로만 알리고 있어 읽는 사람이 거의 없다.
    if (intent && intent.constraint) {
      note(intent.constraint);
    }

    if (isEmpty(intent)) return null;

    // 무대가 분석 탭이면 지도가 아니라 그 탭을 연다. 지도 상태는 건드리지 않는다.
    if (intent.stage) {
      const stage = window.ontology && window.ontology.stageById(intent.stage);
      if (window.openTopicStage && stage) {
        window.openTopicStage(intent.stage, intent.params);
        // 파라미터까지 맞췄으면 그것도 말한다. 안 그러면 사용자는 자기가
        // 요청한 정렬이 반영됐는지 화면을 뒤져 봐야 한다.
        const extra = intent.params ? ` (${Object.values(intent.params).join(", ")} 기준)` : "";
        note(`'${stage.label}' 탭을 열었습니다${extra}`);
      }
      return null;
    }

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
    if (summary) announce(summary, before);
    return before;
  }

  // 채팅 흐름에 한 줄 남긴다. 붙인 요소를 돌려줘 되돌리기 버튼을 얹을 수 있게 한다.
  function note(text) {
    const list = document.getElementById("chat-messages");
    if (!list) return null;
    const wrap = document.createElement("div");
    wrap.className = "intent-note";
    const span = document.createElement("span");
    span.textContent = text; // 사용자 입력이 되비칠 수 있는 자리라 textContent만
    wrap.appendChild(span);
    list.appendChild(wrap);
    list.scrollTop = list.scrollHeight;
    return wrap;
  }

  // 바꿨다고 말하고 되돌릴 길을 준다. 틀렸을 때 빠져나갈 길이 없으면 안 쓰느니만 못하다.
  function announce(summary, before) {
    const message = `지도를 ${summary}(으)로 맞췄습니다`;
    const wrap = note(message);
    if (!wrap) return;

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

    // F1: 스크린리더에게도 알린다. 이미 role="status"인 자리를 쓴다.
    const feedback = document.getElementById("map-search-feedback");
    if (feedback) {
      feedback.textContent = message;
      feedback.classList.add("sr-only");
    }
  }

  window.applyIntent = applyIntent;
})(window);
