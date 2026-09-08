// 분석 주제 버튼 + 상세 뷰. 주제를 하나 고르면 window.screenContext = { topic }로
// 보관하고, chat.js가 /api/chat 요청의 context 필드로 첨부한다.
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

  function fmtPct(v) {
    return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(v % 1 === 0 ? 0 : 2).replace(/\.?0+$/, "") + "%";
  }

  function renderRows(topic) {
    const box = el("div", "topic-rows");
    const maxAbs = Math.max(1, ...topic.rows.filter((r) => r.pct !== undefined).map((r) => Math.abs(r.pct)));

    topic.rows.forEach((r) => {
      const row = el("div", "topic-row");
      row.appendChild(el("span", "topic-row-name", r.name));

      if (r.pct !== undefined) {
        const isRate = r.unit === "%";
        const tone = isRate ? "rate" : r.pct >= 0 ? "up" : "down";
        const bar = el("span", "topic-bar");
        const fill = el("i", `topic-bar-fill ${tone}`);
        fill.style.width = `${Math.round((Math.abs(r.pct) / maxAbs) * 100)}%`;
        bar.appendChild(fill);
        row.appendChild(bar);
        row.appendChild(el("span", `topic-row-value ${tone}`, isRate ? `${r.pct}%` : fmtPct(r.pct)));
      } else {
        row.appendChild(el("span", `topic-row-value text ${r.tone || ""}`.trim(), r.value));
      }
      box.appendChild(row);
    });
    return box;
  }

  function renderDetail(topic) {
    detail.textContent = "";
    if (!topic) {
      detail.appendChild(el("p", "topic-empty", "위에서 분석 주제를 고르면 핵심 수치가 여기 나오고, 우측 AI가 그 주제를 기준으로 답합니다."));
      return;
    }
    detail.appendChild(el("h3", "topic-headline", topic.headline));
    detail.appendChild(el("p", "topic-desc", topic.desc));
    detail.appendChild(renderRows(topic));
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
