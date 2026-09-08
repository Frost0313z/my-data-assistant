// 대시보드 임베드(A2) + 대시보드 → 채팅 화면 상태 브리지(A3b).
//
// 대시보드(다른 origin, GitHub Pages)가 필터를 바꿀 때마다 postMessage로
// { type: "dashboard-state", payload: {...} } 를 보낸다. 여기서 origin을
// 화이트리스트로 검증하고, 최신 상태를 window.screenContext에 보관한다.
// chat.js가 이 값을 읽어 /api/chat 요청의 context 필드로 첨부한다.

window.screenContext = null;

(function () {
  const frame = document.getElementById("dashboard-frame");
  const status = document.getElementById("dashboard-status");
  const openLink = document.getElementById("dashboard-open");
  const chip = document.getElementById("screen-context");

  let loaded = false;

  function showStatus(text, isError) {
    status.textContent = "";
    const p = document.createElement("div");
    p.textContent = text;
    status.appendChild(p);
    if (isError) {
      status.classList.add("error");
      const retry = document.createElement("button");
      retry.textContent = "다시 시도";
      retry.addEventListener("click", loadFrame);
      status.appendChild(retry);
    } else {
      status.classList.remove("error");
    }
    status.hidden = false;
  }

  function loadFrame() {
    loaded = false;
    showStatus("대시보드를 불러오는 중...", false);
    frame.src = window.DASHBOARD_URL;
    // F3: 로드가 15초 안에 끝나지 않으면 실패로 간주하고 안내 + 재시도
    setTimeout(() => {
      if (!loaded) {
        showStatus("대시보드를 불러오지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.", true);
      }
    }, 15000);
  }

  frame.addEventListener("load", () => {
    // src가 빈 상태의 최초 load 이벤트는 무시
    if (!frame.src) return;
    loaded = true;
    status.hidden = true;
  });

  openLink.href = window.DASHBOARD_URL;

  // ── A3b: 대시보드가 보내는 화면 상태 수신 ──
  function renderChip(state) {
    chip.textContent = "";
    const parts = [];
    if (state.district) parts.push(["자치구", state.district]);
    if (state.dong) parts.push(["행정동", state.dong]);
    if (state.category) parts.push(["업종", state.category]);
    if (state.metric) parts.push(["지표", state.metric]);
    if (state.period) parts.push(["기간", state.period]);

    if (parts.length === 0) {
      chip.hidden = true;
      return;
    }
    const lead = document.createElement("span");
    lead.textContent = "현재 화면: ";
    chip.appendChild(lead);
    parts.forEach(([k, v], i) => {
      if (i > 0) chip.appendChild(document.createTextNode(" · "));
      chip.appendChild(document.createTextNode(k + " "));
      const b = document.createElement("b");
      b.textContent = v;
      chip.appendChild(b);
    });
    chip.hidden = false;
  }

  window.addEventListener("message", (e) => {
    if (e.origin !== window.DASHBOARD_ORIGIN) return;
    const data = e.data;
    if (!data || data.type !== "dashboard-state" || typeof data.payload !== "object") return;

    // payload 필드는 문자열만 신뢰. 길이 제한으로 프롬프트 오염 방지.
    const clean = {};
    for (const key of ["district", "dong", "category", "metric", "period", "mapPeriod"]) {
      const val = data.payload[key];
      if (typeof val === "string" && val.trim()) clean[key] = val.trim().slice(0, 80);
    }
    window.screenContext = Object.keys(clean).length ? clean : null;
    renderChip(clean);
  });

  loadFrame();
})();
