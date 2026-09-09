// 분석 주제 버튼 + 상세 뷰. 주제를 하나 고르면 실제 대시보드(GitHub Pages)의 해당 패널을
// "섹션만 보기" 모드(?only=…)로 iframe에 띄우고, window.screenContext = { topic }로 보관한다.
// chat.js가 이 값을 /api/chat 요청의 context 필드로 첨부한다.
// 모든 문자열은 createElement + textContent로만 DOM에 넣는다(출력 이스케이프 규칙).

window.screenContext = null;

(function () {
  const list = document.getElementById("topic-list");
  const detail = document.getElementById("topic-detail");
  const chip = document.getElementById("screen-context");
  const openLink = document.getElementById("dashboard-open");
  let activeId = null;

  openLink.href = window.DASHBOARD_URL;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // 실제 대시보드 패널 임베드. 로딩 표시 + 15초 타임아웃 시 재시도(F3).
  function renderEmbed(topic) {
    const wrap = el("div", "topic-frame-wrap");
    const status = el("div", "frame-status", "대시보드 패널을 불러오는 중...");
    const frame = document.createElement("iframe");
    frame.className = "topic-frame";
    frame.title = `${topic.label} — 대전 상권 대시보드 패널`;
    frame.loading = "lazy";
    wrap.append(status, frame);

    let loaded = false;
    function load() {
      loaded = false;
      status.textContent = "대시보드 패널을 불러오는 중...";
      status.classList.remove("error");
      status.hidden = false;
      frame.src = `${window.DASHBOARD_URL}?${topic.embed}`;
      setTimeout(() => {
        if (loaded) return;
        status.textContent = "";
        status.classList.add("error");
        status.appendChild(el("div", "", "패널을 불러오지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요."));
        const retry = el("button", "", "다시 시도");
        retry.addEventListener("click", load);
        status.appendChild(retry);
      }, 15000);
    }
    frame.addEventListener("load", () => {
      if (!frame.src) return;
      loaded = true;
      status.hidden = true;
    });
    load();
    return wrap;
  }

  // A19: 헤드라인의 증감 값만 중립 색 클래스로 감싼다. 증가=초록 관습을 쓰지 않는 건
  // 브랜드 약속이다 — 매출이 없어 늘어난 게 좋은 일인지 판단할 수 없다.
  // 부호는 + (U+002B) 와 − (U+2212) 만 본다. ASCII 하이픈을 넣으면 날짜(2025-03)가 걸린다.
  // 숫자로 끝나게 한다 — [\d,]+ 로 두면 "+2,800, +3.59%" 에서 구분 쉼표까지 삼킨다.
  // 부호 뒤에 공백이 오면 매치되지 않으므로 "LQ 3.48 + 631개" 의 접속 + 는 걸리지 않는다.
  const TREND_RE = /[+−][\d,]*\d(?:\.\d+)?%?p?/g;

  function renderHeadline(text) {
    const h = el("h3", "topic-headline");
    let last = 0;
    let m;
    TREND_RE.lastIndex = 0;
    while ((m = TREND_RE.exec(text)) !== null) {
      if (m.index > last) h.appendChild(document.createTextNode(text.slice(last, m.index)));
      h.appendChild(el("span", m[0][0] === "+" ? "trend-up" : "trend-down", m[0]));
      last = m.index + m[0].length;
    }
    if (last < text.length) h.appendChild(document.createTextNode(text.slice(last)));
    return h;
  }

  function renderDetail(topic) {
    detail.textContent = "";
    if (!topic) {
      detail.appendChild(el("p", "topic-empty", "위에서 분석 주제를 고르면 대시보드의 해당 패널이 여기 나오고, 우측 AI가 그 주제를 기준으로 답합니다."));
      return;
    }
    detail.appendChild(renderHeadline(topic.headline));
    detail.appendChild(el("p", "topic-desc", topic.desc));
    detail.appendChild(renderEmbed(topic));
    if (topic.note) detail.appendChild(el("p", "topic-note", topic.note));

    const actions = el("div", "topic-actions");
    const ask = el("button", "", "이 주제로 AI에게 질문");
    ask.addEventListener("click", () => {
      const input = document.getElementById("chat-input");
      input.value = `${topic.label}에 대해 핵심만 설명해줘`;
      if (window.switchToChatPane) window.switchToChatPane();
      input.focus();
    });
    const link = el("a", "ghost-link", "전체 대시보드에서 보기 ↗");
    link.href = window.DASHBOARD_URL + (topic.anchor || "");
    link.target = "_blank";
    link.rel = "noopener";
    actions.append(ask, link);
    detail.appendChild(actions);
  }

  function renderChip(topic) {
    chip.textContent = "";
    if (!topic) {
      chip.hidden = true;
      return;
    }
    chip.appendChild(document.createTextNode("선택한 주제: "));
    chip.appendChild(el("b", "", topic.label));
    chip.hidden = false;
  }

  // A27: 지도와 분석 패널이 같은 무대를 나눠 쓴다. 세로로 쌓으면 둘 다 좁아지고
  // 스크롤이 길어져서, 하단 탭으로 무엇을 띄울지 고르는 구조로 바꿨다.
  const stageMap = document.querySelector(".map-explorer");
  const mapTab = document.getElementById("stage-map-tab");

  function setStage(which) {
    const showMap = which === "map";
    if (stageMap) stageMap.hidden = !showMap;
    detail.hidden = showMap;
    if (mapTab) mapTab.setAttribute("aria-pressed", String(showMap));
    // 지도 무대로 돌아오면 MapLibre가 숨어 있던 동안의 크기 변화를 따라잡아야 한다.
    if (showMap && window.resizeDaejeonMap) window.resizeDaejeonMap();
  }

  function select(id) {
    activeId = id === activeId ? null : id; // 같은 버튼 다시 누르면 해제
    // 주제를 고르면 분석 무대로, 해제하면 지도로 돌아간다.
    setStage(activeId ? "topic" : "map");
    const topic = window.TOPICS.find((t) => t.id === activeId) || null;
    window.screenContext = topic ? { topic: topic.label } : null;
    // A10: 제안 질문이 주제를 따라가도록 id를 공개한다. 백엔드로 가는 screenContext는
    // 허용 키가 topic 하나뿐(CONTEXT_KEYS)이라 id를 거기 넣으면 422가 난다.
    window.activeTopicId = activeId;
    if (window.renderSuggestions) window.renderSuggestions();
    list.querySelectorAll("button").forEach((b) => {
      const on = b.dataset.id === activeId;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", String(on));
    });
    renderDetail(topic);
    renderChip(topic);
    // 대화가 이미 시작됐다면 주제가 바뀐 지점을 채팅에 남긴다
    // A11 인사말은 '대화가 시작됐다'는 신호가 아니다. 제외하지 않으면 첫 방문자가
    // 주제를 처음 고르는 순간부터 구분선이 뜬다.
    if (window.notifyTopicChange && document.querySelector("#chat-messages .bubble:not(.onboarding)")) {
      window.notifyTopicChange(topic ? topic.label : null);
    }
  }

  // 지도에서 선택한 지역·시점을 기존 topic 컨텍스트로 전달한다.
  // metricKey를 함께 받아 제안 질문(A10)이 현재 지도 지표를 따라가게 한다.
  window.focusMapAnalysis = function (label, metricKey) {
    activeId = null;
    window.screenContext = { topic: label };
    window.activeTopicId = metricKey || "density";
    list.querySelectorAll("button").forEach((b) => {
      b.classList.remove("active");
      b.setAttribute("aria-pressed", "false");
    });
    setStage("map");
    renderChip({ label });
    if (window.renderSuggestions) window.renderSuggestions();
    if (window.notifyTopicChange && document.querySelector("#chat-messages .bubble:not(.onboarding)")) {
      window.notifyTopicChange(label);
    }
  };

  window.TOPICS.forEach((t) => {
    const b = el("button", "topic-btn", t.label);
    b.dataset.id = t.id;
    b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", () => select(t.id));
    list.appendChild(b);
  });

  // A9: 목적 기반 진입. 주제 버튼은 '데이터 축'이라 처음 온 사람은 무엇을 눌러야
  // 할지 모른다. 목적으로 묻고 주제 선택과 질문 전송을 한 번에 처리한다.
  //
  // 벤치마크(서울시 골목상권)는 같은 문제를 3단계 마법사로 푼다. 우리는 AI가
  // 있으니 1클릭으로 압축한다 — 단계를 늘리면 후퇴다.
  // A28: 목적을 고르면 그 선택이 남는다(페르소나). 한 번 쓰고 버리는 칩이 아니라
  // 지도 기본 지표와 제안 질문이 그 사람 기준으로 맞춰진다.
  //
  // 고를 때는 질문형, 고른 뒤에는 정체형으로 보여준다. 처음 온 사람에게
  // "당신은 창업준비형입니까"는 자기 분류를 요구하지만 "여기 창업해도 될까요"는
  // 이미 갖고 온 질문이라 답하기 쉽다.
  const PERSONAS = [
    {
      id: "explore",
      label: "어디가 뜨고 있나요?",
      desc: "관심 지역을 넓게 둘러봅니다",
      short: "둘러보는 중",
      mapMetric: "stores",
      topicId: "growth",
      question: "어디가 성장하고 있고 어디가 정체돼 있어? 근거 수치와 함께 알려줘",
    },
    {
      id: "prepare",
      label: "여기 창업해도 될까요?",
      desc: "후보지의 밀도·교체율·잔존율을 봅니다",
      short: "창업 준비 중",
      mapMetric: "density",
      question:
        "공급 밀도와 점포 교체율, 잔존율을 함께 보면 이 지역 상권은 어떤 상태야? 이 데이터로 알 수 없는 것도 같이 알려줘",
    },
    {
      id: "running",
      label: "내 업종은 어떤가요?",
      desc: "업종 구성과 증감을 봅니다",
      short: "운영 중",
      mapMetric: "hhi",
      topicId: "industry",
      question: "업종별로 늘어난 곳과 줄어든 곳을 근거 수치와 함께 알려줘",
    },
  ];

  const PERSONA_KEY = "persona_v1";
  const personaBox = document.getElementById("persona");
  const personaCurrent = document.getElementById("persona-current");

  function storePersona(id) {
    try { window.localStorage.setItem(PERSONA_KEY, id || ""); } catch (e) { /* 사생활 보호 모드 */ }
  }
  function loadPersona() {
    try { return window.localStorage.getItem(PERSONA_KEY) || ""; } catch (e) { return ""; }
  }

  // 고르기 전에는 카드가 지도 위에 크게, 고른 뒤에는 한 줄로 접힌다.
  function showPersona(id) {
    const chosen = PERSONAS.find((p) => p.id === id);
    // id가 "skip"이면 고른 페르소나는 없지만 카드는 접는다 — 지도부터 보겠다는 뜻이다.
    if (personaBox) personaBox.hidden = !!id;
    if (personaCurrent) {
      // 카드가 접혀 있으면 어떤 상태든 돌아갈 줄을 남긴다. 건너뛴 사람에게 이 줄이
      // 없으면 localStorage를 지우기 전에는 카드를 다시 볼 방법이 없다.
      personaCurrent.hidden = !id;
      const labelEl = document.getElementById("persona-current-label");
      const resetEl = document.getElementById("persona-reset");
      if (labelEl) labelEl.textContent = chosen ? chosen.short : "목적을 고르면 화면이 맞춰집니다";
      if (resetEl) resetEl.textContent = chosen ? "바꾸기" : "고르기";
    }
    window.activePersona = chosen ? chosen.id : null;
  }

  // 페르소나를 적용한다. ask=false면 화면만 맞추고 질문은 보내지 않는다(재방문 복원).
  function applyPersona(persona, ask) {
    storePersona(persona.id);
    showPersona(persona.id);
    // map.js는 이 파일보다 늦게 로드되고 데이터도 비동기로 받는다. 아직 준비 전이면
    // 원하는 지표를 남겨두고 map.js가 초기화 끝에 집어가게 한다.
    if (persona.mapMetric) {
      if (window.setMapMetric) window.setMapMetric(persona.mapMetric);
      else window.pendingMapMetric = persona.mapMetric;
    }
    if (window.renderSuggestions) window.renderSuggestions();
    if (ask && window.sendMessage) window.sendMessage({ text: persona.question });
  }

  const personaList = document.getElementById("persona-list");
  PERSONAS.forEach((persona) => {
    const card = el("button", "persona-card");
    card.append(el("strong", "", persona.label), el("span", "", persona.desc));
    card.addEventListener("click", () => applyPersona(persona, true));
    personaList.appendChild(card);
  });

  const skip = document.getElementById("persona-skip");
  if (skip) skip.addEventListener("click", () => { storePersona("skip"); showPersona("skip"); });

  const resetPersona = document.getElementById("persona-reset");
  if (resetPersona) {
    resetPersona.addEventListener("click", () => {
      storePersona("");
      showPersona("");
      // 카드는 지도 위에 있어 아래로 스크롤한 상태면 화면 밖이다. 눌렀는데 아무 일도
      // 안 일어난 것처럼 보이지 않게 데려온다.
      if (personaBox) {
        personaBox.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
        const first = personaBox.querySelector(".persona-card");
        if (first) first.focus();
      }
    });
  }

  function reducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  // 재방문 복원 — 화면만 맞추고 질문은 다시 보내지 않는다.
  const saved = loadPersona();
  showPersona(saved);
  const savedPersona = PERSONAS.find((p) => p.id === saved);
  if (savedPersona) applyPersona(savedPersona, false);

  // '지도' 탭 — 주제 선택을 풀고 지도 무대로 돌아온다.
  if (mapTab) {
    mapTab.addEventListener("click", () => {
      if (activeId) select(activeId); // 같은 id를 넘기면 해제되고 setStage("map")까지 처리된다
      else setStage("map");
    });
  }

  renderDetail(null);
  setStage("map");
})();
