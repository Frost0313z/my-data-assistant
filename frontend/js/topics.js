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
    const exit = el("button", "frame-exit", "원래 크기로");
    exit.addEventListener("click", () => {
      if (document.fullscreenElement === wrap) document.exitFullscreen();
    });
    wrap.append(exit, status, frame);

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
    const actions = el("div", "topic-actions");
    const ask = el("button", "", "이 주제로 AI에게 질문");
    ask.addEventListener("click", () => {
      const input = document.getElementById("chat-input");
      input.value = `${topic.label}에 대해 핵심만 설명해줘`;
      if (window.switchToChatPane) window.switchToChatPane();
      input.focus();
    });
    // 해설은 요청할 때 펼친다. 열어도 차트 높이와 스크롤 위치가 바뀌지 않는다.
    const help = el("details", "topic-help");
    const helpToggle = el("summary", "", "해석·주의사항");
    const helpContent = el("div", "topic-help-content");
    helpContent.appendChild(el("p", "topic-desc", topic.desc));
    if (topic.note) helpContent.appendChild(el("p", "topic-note", topic.note));
    help.append(helpToggle, helpContent);
    help.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { help.open = false; helpToggle.focus(); }
    });
    actions.append(ask, help);
    const embed = renderEmbed(topic);
    if (document.fullscreenEnabled) {
      const expand = el("button", "", "차트 확대");
      expand.addEventListener("click", async () => {
        try { await embed.requestFullscreen(); }
        catch { expand.textContent = "다시 확대"; }
      });
      embed.addEventListener("fullscreenchange", () => {
        if (!document.fullscreenElement && expand.isConnected) expand.focus();
      });
      actions.appendChild(expand);
    }
    detail.appendChild(actions);
    detail.appendChild(embed);
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
    document.querySelector(".layout").classList.toggle("analysis-open", !showMap);
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
  window.focusMapAnalysis = function (label, metricKey, regionType) {
    activeId = null;
    // A26: 유형은 화면이 만든 구분이라 라벨만 보내면 AI가 뜻을 모른 채 평가해 버린다.
    window.screenContext = regionType ? { topic: label, regionType: regionType } : { topic: label };
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

  // G그룹 전용 진입점: 무대를 지도로 되돌린다.
  //
  // **`select()`를 쓰지 않는다.** 그 함수는 토글이라(`activeId === id ? null : id`)
  // 이미 열린 탭 id로 부르면 오히려 닫히고, `notifyTopicChange`로 채팅에 주제
  // 구분선까지 남긴다. 되돌리기(G4)와 겹치면 구분선이 두 개 쌓인다.
  // 여기서는 무대만 바꾸고 대화에는 아무 자국도 남기지 않는다.
  window.focusMapStage = function () {
    if (activeId) {
      activeId = null;
      window.screenContext = null;
      window.activeTopicId = null;
      list.querySelectorAll("button").forEach((b) => {
        b.classList.remove("active");
        b.setAttribute("aria-pressed", "false");
      });
      renderDetail(null);
      renderChip(null);
      if (window.renderSuggestions) window.renderSuggestions();
    }
    setStage("map");
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
  const personaToggle = document.getElementById("persona-panel-toggle");

  function storePersona(id) {
    try { window.localStorage.setItem(PERSONA_KEY, id || ""); } catch (e) { /* 사생활 보호 모드 */ }
  }
  function loadPersona() {
    try { return window.localStorage.getItem(PERSONA_KEY) || ""; } catch (e) { return ""; }
  }

  // A30: 접히는 한 줄 대신 헤더 버튼 라벨이 현재 목적을 진다.
  // 어떤 상태에서도 그 버튼이 돌아갈 길이다 — 건너뛴 사람도 포함해서.
  function showPersona(id) {
    const chosen = PERSONAS.find((p) => p.id === id);
    if (personaToggle) personaToggle.textContent = chosen ? `목적: ${chosen.short}` : "목적 고르기";
    window.activePersona = chosen ? chosen.id : null;
  }

  // 페르소나를 적용한다. ask=false면 화면만 맞추고 질문은 보내지 않는다(재방문 복원).
  function applyPersona(persona, ask) {
    storePersona(persona.id);
    showPersona(persona.id);
    // 고르는 순간 패널은 할 일을 마쳤다. 닫아야 바뀐 지도가 보인다.
    if (ask && window.closePersonaPanel) window.closePersonaPanel();
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
  if (skip) {
    skip.addEventListener("click", () => {
      // "skip"을 저장해야 다음 방문에 다시 열리지 않는다. 고른 목적은 없지만
      // 지도부터 보겠다는 것도 하나의 답이다.
      storePersona("skip");
      showPersona("skip");
      if (window.closePersonaPanel) window.closePersonaPanel();
      if (personaToggle) personaToggle.focus();
    });
  }

  // 재방문 복원 — 화면만 맞추고 질문은 다시 보내지 않는다.
  const saved = loadPersona();
  showPersona(saved);
  const savedPersona = PERSONAS.find((p) => p.id === saved);
  if (savedPersona) applyPersona(savedPersona, false);

  // A30: 첫 방문에만 자동으로 연다.
  //
  // 기준을 persona_v1 미설정으로 잡았다. 스펙에는 onboarded_v1이라고 적었지만
  // 그건 인사말(A11)의 열쇠라 두 기능이 엮인다. "아직 고르지도 건너뛰지도
  // 않았다"가 이 패널이 물어야 할 조건이고, 그건 예전에 카드를 띄우던 조건과
  // 정확히 같다 — 동작이 바뀌지 않는다.
  //
  // 열지 않으면 A28이 죽는다. 눈에 안 띄어서 칩을 카드로 승격한 것인데
  // 버튼 뒤에만 두면 원위치다.
  //
  // DOMContentLoaded까지 미루는 이유: 이 파일이 tabs.js보다 먼저 로드돼서
  // 지금은 window.openPersonaPanel이 아직 없다.
  if (!saved) {
    document.addEventListener("DOMContentLoaded", () => {
      if (window.openPersonaPanel) window.openPersonaPanel();
    });
  }

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
