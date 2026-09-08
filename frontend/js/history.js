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

  refreshHistory();
  refreshSummary();
  refreshDataTable();
});
