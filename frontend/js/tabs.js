// 좁은 화면(<=900px)에서 좌/중앙/우 패널을 하단 탭으로 전환한다.
// 넓은 화면에서는 탭바를 숨기고 세 패널을 모두 표시(CSS 그리드).

(function () {
  const MQ = window.matchMedia("(max-width: 900px)");
  const tabbar = document.getElementById("tabbar");
  const layout = document.querySelector(".layout");
  const dataToggle = document.getElementById("data-panel-toggle");
  const buttons = Array.from(tabbar.querySelectorAll("button"));
  const panes = ["pane-side", "pane-dashboard", "pane-chat"].map((id) => document.getElementById(id));

  function activate(paneId) {
    panes.forEach((p) => p.classList.toggle("pane-active", p.id === paneId));
    buttons.forEach((b) => b.classList.toggle("active", b.dataset.pane === paneId));
  }

  function applyMode() {
    layout.classList.remove("data-open");
    dataToggle.setAttribute("aria-expanded", "false");
    if (MQ.matches) {
      tabbar.hidden = false;
      const current = buttons.find((b) => b.classList.contains("active"));
      activate(current ? current.dataset.pane : "pane-dashboard");
    } else {
      tabbar.hidden = true;
      panes.forEach((p) => p.classList.remove("pane-active"));
    }
  }

  buttons.forEach((b) => b.addEventListener("click", () => activate(b.dataset.pane)));
  dataToggle.addEventListener("click", () => {
    const open = layout.classList.toggle("data-open");
    dataToggle.setAttribute("aria-expanded", String(open));
  });

  // A22: 지도를 넓게 보려고 채팅 칸을 접는다. CSS 규칙이 넓은 화면에만 걸려 있어
  // 좁은 화면(탭 모드)에서는 이 클래스가 남아 있어도 채팅 탭이 정상 동작한다.
  const chatToggle = document.getElementById("chat-panel-toggle");
  chatToggle.addEventListener("click", () => {
    const collapsed = layout.classList.toggle("chat-collapsed");
    chatToggle.setAttribute("aria-expanded", String(!collapsed));
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && layout.classList.contains("data-open")) {
      layout.classList.remove("data-open");
      dataToggle.setAttribute("aria-expanded", "false");
      dataToggle.focus();
    }
  });
  MQ.addEventListener("change", applyMode);
  applyMode();

  // 채팅에서 답변이 오면 모바일 사용자가 놓치지 않게 채팅 탭으로 이동시키는 훅
  window.switchToChatPane = function () {
    if (MQ.matches) activate("pane-chat");
  };
})();
