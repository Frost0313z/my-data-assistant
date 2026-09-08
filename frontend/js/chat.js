let currentConversationId = null;

const SUGGESTIONS = [
  "지금 보고 있는 화면을 요약해줘",
  "이 지역 상권은 성장 중이야, 위축 중이야?",
  "교체율이 높다는 게 무슨 뜻이야?",
];

function appendMessage(role, content) {
  const list = document.getElementById("chat-messages");
  const bubble = document.createElement("div");
  bubble.className = `bubble ${role}`;
  bubble.textContent = content;
  list.appendChild(bubble);
  list.scrollTop = list.scrollHeight;
  return bubble;
}

// F3: 에러 버블 — 상황별 문구 + 재시도 버튼
function showErrorBubble(kind, retryFn) {
  const list = document.getElementById("chat-messages");
  const bubble = document.createElement("div");
  bubble.className = "bubble error";

  const messages = {
    cold: "백엔드가 잠들어 있어 깨우는 중입니다. 무료 플랜이라 최대 50초 걸릴 수 있어요. 잠시 후 다시 시도해 주세요.",
    ai: "AI 응답 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    generic: "요청을 처리하지 못했습니다. 네트워크 상태를 확인하고 다시 시도해 주세요.",
  };
  bubble.appendChild(document.createTextNode(messages[kind] || messages.generic));

  if (retryFn) {
    const retry = document.createElement("button");
    retry.textContent = "다시 시도";
    retry.addEventListener("click", () => {
      bubble.remove();
      retryFn();
    });
    bubble.appendChild(retry);
  }
  list.appendChild(bubble);
  list.scrollTop = list.scrollHeight;
}

function classifyError(err) {
  const msg = (err && err.message) || "";
  if (/Failed to fetch|NetworkError|timeout|시간 초과/i.test(msg)) return "cold";
  if (/OpenAI|AI|502|503|LLM/i.test(msg)) return "ai";
  return "generic";
}

function renderSuggestions() {
  const box = document.getElementById("chat-suggestions");
  box.textContent = "";
  SUGGESTIONS.forEach((text) => {
    const b = document.createElement("button");
    b.textContent = text;
    b.addEventListener("click", () => {
      document.getElementById("chat-input").value = text;
      sendMessage();
    });
    box.appendChild(b);
  });
}

function startNewConversation() {
  currentConversationId = null;
  document.getElementById("chat-messages").innerHTML = "";
  renderSuggestions();
}

async function loadConversationIntoChat(conversationId) {
  const conversation = await api.getConversation(conversationId);
  currentConversationId = conversation.id;
  const list = document.getElementById("chat-messages");
  list.innerHTML = "";
  (conversation.messages || []).forEach((m) => appendMessage(m.role, m.content));
  document.getElementById("chat-suggestions").textContent = "";
}

async function sendMessage() {
  const input = document.getElementById("chat-input");
  const message = input.value.trim();
  if (!message) return;

  input.value = "";
  document.getElementById("chat-suggestions").textContent = "";
  appendMessage("user", message);
  if (window.switchToChatPane) window.switchToChatPane();
  const loadingBubble = appendMessage("assistant", "생각하는 중...");

  try {
    const result = await api.sendChat(message, currentConversationId, window.screenContext);
    currentConversationId = result.conversation_id;
    loadingBubble.textContent = result.reply;
    refreshHistory();
  } catch (err) {
    loadingBubble.remove();
    showErrorBubble(classifyError(err), () => {
      input.value = message;
      sendMessage();
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("chat-send").addEventListener("click", sendMessage);
  document.getElementById("chat-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
  });
  document.getElementById("chat-new").addEventListener("click", startNewConversation);
  renderSuggestions();
});
