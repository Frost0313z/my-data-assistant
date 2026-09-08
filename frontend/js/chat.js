let currentConversationId = null;

function appendMessage(role, content) {
  const list = document.getElementById("chat-messages");
  const bubble = document.createElement("div");
  bubble.className = `bubble ${role}`;
  bubble.textContent = content;
  list.appendChild(bubble);
  list.scrollTop = list.scrollHeight;
  return bubble;
}

function startNewConversation() {
  currentConversationId = null;
  document.getElementById("chat-messages").innerHTML = "";
}

async function loadConversationIntoChat(conversationId) {
  const conversation = await api.getConversation(conversationId);
  currentConversationId = conversation.id;
  const list = document.getElementById("chat-messages");
  list.innerHTML = "";
  (conversation.messages || []).forEach((m) => appendMessage(m.role, m.content));
}

async function sendMessage() {
  const input = document.getElementById("chat-input");
  const message = input.value.trim();
  if (!message) return;

  input.value = "";
  appendMessage("user", message);
  const loadingBubble = appendMessage("assistant", "생각하는 중...");

  try {
    const result = await api.sendChat(message, currentConversationId);
    currentConversationId = result.conversation_id;
    loadingBubble.textContent = result.reply;
    refreshHistory();
  } catch (err) {
    loadingBubble.textContent = `오류가 발생했습니다: ${err.message}`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("chat-send").addEventListener("click", sendMessage);
  document.getElementById("chat-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
  });
  document.getElementById("chat-new").addEventListener("click", startNewConversation);
});
