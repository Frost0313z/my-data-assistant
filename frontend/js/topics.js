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

  function renderDetail(topic) {
    detail.textContent = "";
    if (!topic) {
      detail.appendChild(el("p", "topic-empty", "위에서 분석 주제를 고르면 대시보드의 해당 패널이 여기 나오고, 우측 AI가 그 주제를 기준으로 답합니다."));
      return;
    }
    detail.appendChild(el("h3", "topic-headline", topic.headline));
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
    list.querySelectorAll("button").forEach((b) => {
      const on = b.dataset.id === activeId;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", String(on));
    });
    renderDetail(topic);
    renderChip(topic);
    // 대화가 이미 시작됐다면 주제가 바뀐 지점을 채팅에 남긴다
    if (window.notifyTopicChange && document.querySelector("#chat-messages .bubble")) {
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
  renderDetail(null);
})();
