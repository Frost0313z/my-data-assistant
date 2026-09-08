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

  function select(id) {
    activeId = id === activeId ? null : id; // 같은 버튼 다시 누르면 해제
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
  const PURPOSE_CHIPS = [
    {
      label: "어디가 뜨고 있나요?",
      topicId: "growth",
      question: "어디가 성장하고 있고 어디가 정체돼 있어? 근거 수치와 함께 알려줘",
    },
    {
      label: "내 업종은 어떤가요?",
      topicId: "industry",
      question: "업종별로 늘어난 곳과 줄어든 곳을 근거 수치와 함께 알려줘",
    },
    {
      // 스펙상 공급밀도·교체율·잔존율 세 주제에 걸치는데 주제는 단일 선택이다.
      // 화면은 공급 밀도를 열고, 나머지 둘은 질문에 담아 답변에서 함께 다루게 한다.
      label: "여기 창업해도 될까요?",
      topicId: "density",
      question:
        "공급 밀도와 점포 교체율, 잔존율을 함께 보면 이 지역 상권은 어떤 상태야? 이 데이터로 알 수 없는 것도 같이 알려줘",
    },
  ];

  const chipList = document.getElementById("purpose-chip-list");
  PURPOSE_CHIPS.forEach((chip) => {
    const b = el("button", "purpose-chip", chip.label);
    b.addEventListener("click", () => {
      // select()는 같은 id를 다시 누르면 해제하는 라디오식이다. 목적 칩은
      // 항상 켜는 동작이라 이미 선택돼 있으면 다시 부르지 않는다.
      if (activeId !== chip.topicId) select(chip.topicId);
      if (window.sendMessage) window.sendMessage({ text: chip.question });
    });
    chipList.appendChild(b);
  });

  renderDetail(null);
})();
