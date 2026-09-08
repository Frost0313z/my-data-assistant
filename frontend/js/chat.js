let currentConversationId = null;

const SUGGESTIONS = [
  "이 주제의 핵심을 세 줄로 요약해줘",
  "어느 지역이 성장 중이고 어디가 정체야?",
  "교체율이 높다는 게 무슨 뜻이야?",
];

let lastNotifiedTopic = null;

function appendMessage(role, content) {
  const list = document.getElementById("chat-messages");
  const bubble = document.createElement("div");
  bubble.className = `bubble ${role}`;
  bubble.textContent = content;
  list.appendChild(bubble);
  list.scrollTop = list.scrollHeight;
  return bubble;
}

// 주제를 바꾸면 대화 흐름에 그 지점을 남긴다 (topics.js가 호출).
function notifyTopicChange(label) {
  if (label === lastNotifiedTopic) return;
  lastNotifiedTopic = label;
  const list = document.getElementById("chat-messages");
  const div = document.createElement("div");
  div.className = "topic-divider";
  div.textContent = label ? `주제를 '${label}'(으)로 바꿨습니다` : "주제 선택을 해제했습니다";
  list.appendChild(div);
  list.scrollTop = list.scrollHeight;
}

// 답변 아래 토큰 사용량 문구
function appendUsage(usage) {
  if (!usage || !usage.total_tokens) return;
  const list = document.getElementById("chat-messages");
  const line = document.createElement("div");
  line.className = "usage";
  const n = (v) => (v || 0).toLocaleString("ko-KR");
  line.textContent = `토큰 ${n(usage.total_tokens)} (입력 ${n(usage.prompt_tokens)} · 출력 ${n(usage.completion_tokens)})`;
  list.appendChild(line);
  list.scrollTop = list.scrollHeight;
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
  lastNotifiedTopic = null;
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
  lastNotifiedTopic = null;
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
    appendUsage(result.usage);
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
