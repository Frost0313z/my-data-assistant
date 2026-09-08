// 좁은 화면(<=900px)에서 좌/중앙/우 패널을 하단 탭으로 전환한다.
// 넓은 화면에서는 탭바를 숨기고 세 패널을 모두 표시(CSS 그리드).

(function () {
  const MQ = window.matchMedia("(max-width: 900px)");
  const tabbar = document.getElementById("tabbar");
  const buttons = Array.from(tabbar.querySelectorAll("button"));
  const panes = ["pane-side", "pane-dashboard", "pane-chat"].map((id) => document.getElementById(id));

  function activate(paneId) {
    panes.forEach((p) => p.classList.toggle("pane-active", p.id === paneId));
    buttons.forEach((b) => b.classList.toggle("active", b.dataset.pane === paneId));
  }

  function applyMode() {
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
  MQ.addEventListener("change", applyMode);
  applyMode();

  // 채팅에서 답변이 오면 모바일 사용자가 놓치지 않게 채팅 탭으로 이동시키는 훅
  window.switchToChatPane = function () {
    if (MQ.matches) activate("pane-chat");
  };
})();
