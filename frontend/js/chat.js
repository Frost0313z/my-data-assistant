let currentConversationId = null;

// A10: 주제별 제안 질문. 주제를 바꾸면 칩도 함께 바뀐다.
// topics-data.js가 아니라 여기 두는 이유: 그 파일은 insights.md와 같은 출처를
// 미러링하는 분석 데이터고, 제안 질문은 UI 문구라 성격이 다르다.
//
// 문구 규칙 — 각 주제마다 마지막 하나는 '이 데이터로 알 수 없는 것'을 묻는다.
// 한계를 먼저 말하는 게 이 서비스의 차별점이라 진입 질문에서부터 드러낸다.
const SUGGESTIONS_DEFAULT = [
  "이 데이터로 뭘 알 수 있어?",
  "어느 지역이 성장 중이고 어디가 정체야?",
  "이 데이터의 한계는 뭐야?",
];

const SUGGESTIONS_BY_TOPIC = {
  scale: [
    "2,800개 증가는 큰 편이야?",
    "6개 시점 추이에서 눈에 띄는 구간은?",
    "이 수치로는 알 수 없는 게 뭐야?",
  ],
  district: [
    "자치구별 증감을 순서대로 알려줘",
    "서구와 동구 격차가 2%p 안쪽인 건 어떻게 봐야 해?",
    "증감률만으로 판단하기 어려운 점은?",
  ],
  industry: [
    "부동산업은 늘고 음식점업은 준 배경이 뭐야?",
    "업종별 증감 상위·하위를 알려줘",
    "히트맵에서 예외적인 칸이 있어?",
  ],
  survival: [
    "잔존율 73.7%는 어떻게 읽어야 해?",
    "공급밀도 1·2위가 오히려 안정적인 이유는?",
    "잔존율로는 알 수 없는 게 뭐야?",
  ],
  density: [
    "중앙동 585개는 과밀이라는 뜻이야?",
    "생활권 행정동들의 밀도는 어느 정도야?",
    "밀도만으로 판단할 수 없는 건 뭐야?",
  ],
  lq: [
    "LQ 1.0이 무슨 뜻이야?",
    "LQ가 높은데 규모는 작은 사례가 있어?",
    "특화도만 보고 판단하면 안 되는 이유는?",
  ],
  growth: [
    "성장 상권과 정체 상권을 나눠서 알려줘",
    "목동과 대흥동이 예외인 이유는?",
    "이 산점도로는 판단할 수 없는 게 뭐야?",
  ],
  turnover: [
    "교체율 높은 동 TOP 5",
    "교체율이 높으면 나쁜 건가?",
    "순증이 0인데 교체율이 높으면 무슨 뜻이야?",
  ],
};

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

  // 이 버블은 요청이 '실제로 실패했을 때'만 뜬다. 대기 중 안내는 A21 타이머가 맡는다.
  // 예전 cold 문구는 "깨우는 중… 잠시 후 다시 시도"였는데, 콜드스타트 요청은 붙잡힌 채
  // 자동 완료되므로(실측 43초) 재시도를 권하는 것이 오안내였다.
  const messages = {
    connection: "서버에 연결하지 못했습니다. 백엔드가 절전 상태였다면 다시 시도할 때 깨어납니다 (최대 50초). 로컬에서 개발 중이라면 백엔드 실행 여부와 CORS 설정도 확인해 주세요.",
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

// 'cold'가 아니라 'connection'으로 분류한다. fetch 실패는 콜드스타트뿐 아니라
// 백엔드 미실행·CORS 차단으로도 나는데, 실제로 로컬 CORS 실패를 콜드스타트로
// 오진한 적이 있다. 원인을 단정할 수 없으므로 이름과 문구를 중립적으로 둔다.
function classifyError(err) {
  const msg = (err && err.message) || "";
  if (/Failed to fetch|NetworkError|timeout|시간 초과/i.test(msg)) return "connection";
  if (/OpenAI|AI|502|503|LLM/i.test(msg)) return "ai";
  return "generic";
}

// topics.js가 주제를 바꿀 때마다 다시 부른다(window.activeTopicId 기준).
function renderSuggestions() {
  const box = document.getElementById("chat-suggestions");
  box.textContent = "";
  const list = SUGGESTIONS_BY_TOPIC[window.activeTopicId] || SUGGESTIONS_DEFAULT;
  list.forEach((text) => {
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
