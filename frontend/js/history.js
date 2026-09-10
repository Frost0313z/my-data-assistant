// 출력 이스케이프: 대화 제목(c.title)은 첫 사용자 메시지에서 파생되므로 신뢰 불가.
// innerHTML 조립 대신 createElement + textContent로만 넣는다.

function setHistoryMessage(list, text) {
  list.innerHTML = "";
  const li = document.createElement("li");
  li.className = "empty";
  li.textContent = text;
  list.appendChild(li);
}

async function refreshHistory() {
  const list = document.getElementById("history-list");
  try {
    const conversations = await api.listConversations();
    if (conversations.length === 0) {
      setHistoryMessage(list, "아직 대화 기록이 없습니다.");
      return;
    }
    list.innerHTML = "";
    conversations.forEach((c) => {
      const li = document.createElement("li");

      const load = document.createElement("button");
      load.dataset.action = "load";
      load.dataset.id = c.id;
      load.textContent = c.title;

      const del = document.createElement("button");
      del.dataset.action = "delete";
      del.dataset.id = c.id;
      del.className = "danger";
      del.textContent = "삭제";

      li.append(load, del);
      list.appendChild(li);
    });
  } catch (err) {
    setHistoryMessage(list, `대화 기록을 불러오지 못했습니다: ${err.message}`);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("history-list").addEventListener("click", async (e) => {
    const button = e.target.closest("button");
    if (!button) return;
    const id = button.dataset.id;

    if (button.dataset.action === "load") {
      await loadConversationIntoChat(id);
    } else if (button.dataset.action === "delete") {
      if (!confirm("이 대화를 삭제할까요?")) return;
      await api.deleteConversation(id);
      refreshHistory();
    }
  });

  // 부팅에서 읽지 않는다.
  //
  // 이 세 가지(기록·요약·데이터 표)는 전부 사이드 패널 안에 있고, 그 패널은
  // 기본 display:none이다. 열지도 않은 패널을 위해 매 로드마다 Firestore를
  // 읽다가 2026-09-10에 하루 한도를 태웠다. 데이터 표는 그중 가장 비싸서
  // 별도로 다룬다(data.js의 ensureDataTable — 안쪽 <details>까지 펼쳐야 읽는다).
  //
  // 패널이 실제로 열릴 때 tabs.js가 이것을 부른다. 한 번만 읽는다 — 이후
  // 갱신은 각자의 쓰기 경로가 맡는다(대화는 chat.js, 데이터는 data.js).
  let sideLoaded = false;
  window.loadSidePanel = function () {
    if (sideLoaded) return;
    sideLoaded = true;
    refreshHistory();
    refreshSummary();
  };
});
