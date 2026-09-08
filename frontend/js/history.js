async function refreshHistory() {
  const list = document.getElementById("history-list");
  try {
    const conversations = await api.listConversations();
    list.innerHTML = "";
    if (conversations.length === 0) {
      list.innerHTML = `<li class="empty">아직 대화 기록이 없습니다.</li>`;
      return;
    }
    conversations.forEach((c) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <button data-action="load" data-id="${c.id}">${c.title}</button>
        <button data-action="delete" data-id="${c.id}" class="danger">삭제</button>
      `;
      list.appendChild(li);
    });
  } catch (err) {
    list.innerHTML = `<li class="empty">대화 기록을 불러오지 못했습니다: ${err.message}</li>`;
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
