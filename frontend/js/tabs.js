// 좁은 화면(<=900px)에서 좌/중앙/우 패널을 하단 탭으로 전환한다.
// 넓은 화면에서는 탭바를 숨기고 세 패널을 모두 표시(CSS 그리드).

(function () {
  const MQ = window.matchMedia("(max-width: 900px)");
  const tabbar = document.getElementById("tabbar");
  const layout = document.querySelector(".layout");
  const dataToggle = document.getElementById("data-panel-toggle");
  const personaToggle = document.getElementById("persona-panel-toggle");
  const buttons = Array.from(tabbar.querySelectorAll("button"));
  const panes = ["pane-side", "pane-dashboard", "pane-chat"].map((id) => document.getElementById(id));

  // A30: 플로팅 패널 두 개는 좌표·폭·z-index가 같아 동시에 열면 정확히 겹친다.
  // 한 곳에서 관리해 항상 하나만 열리게 한다.
  const FLOATING = [
    { cls: "data-open", toggle: dataToggle, onOpen: loadSide },
    { cls: "persona-open", toggle: personaToggle },
  ];

  function setFloating(cls, open) {
    FLOATING.forEach((p) => {
      const on = p.cls === cls ? open : false;
      layout.classList.toggle(p.cls, on);
      if (p.toggle) p.toggle.setAttribute("aria-expanded", String(on));
      if (on && p.onOpen) p.onOpen();
    });
  }
  // 다른 파일에서도 연다(topics.js의 첫 방문 자동 오픈 · '목적 바꾸기').
  window.openPersonaPanel = function () { setFloating("persona-open", true); };
  window.closePersonaPanel = function () { setFloating("persona-open", false); };

  // 사이드 패널은 기본 display:none이라 부팅에서 내용을 읽지 않는다(history.js).
  // 눈에 보이게 되는 두 경로(넓은 화면 토글 · 좁은 화면 탭)에서 한 번 부른다.
  function loadSide() {
    if (window.loadSidePanel) window.loadSidePanel();
  }

  function activate(paneId) {
    panes.forEach((p) => p.classList.toggle("pane-active", p.id === paneId));
    buttons.forEach((b) => b.classList.toggle("active", b.dataset.pane === paneId));
    if (paneId === "pane-side") loadSide();
  }

  function applyMode() {
    setFloating(null, false); // 폭이 바뀌면 떠 있던 패널을 모두 닫는다
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
  FLOATING.forEach((p) => {
    if (!p.toggle) return;
    p.toggle.addEventListener("click", () => setFloating(p.cls, !layout.classList.contains(p.cls)));
  });

  // A22: 지도를 넓게 보려고 채팅 칸을 접는다. CSS 규칙이 넓은 화면에만 걸려 있어
  // 좁은 화면(탭 모드)에서는 이 클래스가 남아 있어도 채팅 탭이 정상 동작한다.
  const chatToggle = document.getElementById("chat-panel-toggle");
  chatToggle.addEventListener("click", () => {
    const collapsed = layout.classList.toggle("chat-collapsed");
    chatToggle.setAttribute("aria-expanded", String(!collapsed));
  });
  // Esc로 닫고 포커스를 연 버튼으로 되돌린다. 모달이 아니라 포커스 트랩은 없지만,
  // 닫는 길과 돌아갈 자리는 있어야 한다.
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const open = FLOATING.find((p) => layout.classList.contains(p.cls));
    if (!open) return;
    setFloating(open.cls, false);
    if (open.toggle) open.toggle.focus();
  });
  MQ.addEventListener("change", applyMode);
  applyMode();

  // 채팅에서 답변이 오면 모바일 사용자가 놓치지 않게 채팅 탭으로 이동시키는 훅
  window.switchToChatPane = function () {
    if (MQ.matches) activate("pane-chat");
  };
})();
