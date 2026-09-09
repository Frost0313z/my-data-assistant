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
  // 아래 세 키는 임베드 주제가 아니라 지도 지표(A23)에 붙는다. map.js가 지표를 바꾸면
  // window.activeTopicId가 지표 키로 바뀌어 제안 질문도 따라온다.
  change: [
    "늘어난 동과 줄어든 동은 각각 어디야?",
    "월평3동 +82.2%는 왜 그렇게 커?",
    "많이 늘어난 곳이 좋은 곳이라는 뜻이야?",
  ],
  // A26 지역 유형. 유형은 우리가 만든 구분이라 "이 유형이 좋은 거야?"가 반드시 나온다.
  // 그 질문을 제안에 미리 올려 두고 프롬프트가 정직하게 받게 한다.
  type: [
    "이 유형은 좋은 거야, 나쁜 거야?",
    "촘촘한 곳과 성긴 곳은 뭐가 다른 거야?",
    "교체율이 높으면 위험하다는 뜻이야?",
  ],
  hhi: [
    "업종 집중도가 높다는 게 무슨 뜻이야?",
    "집중도가 높은데 규모는 작은 사례가 있어?",
    "집중도만 보고 판단하면 안 되는 이유는?",
  ],
  stores: [
    "업소 수가 가장 많은 동은 어디야?",
    "업소 수와 공급 밀도 순위가 왜 달라?",
    "업소 수만으로는 알 수 없는 게 뭐야?",
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

// A11: 첫 방문 온보딩. 모달로 막지 않고 AI의 첫 인사말로 전한다.
// A20: 사용자 확정 서비스명과 한 줄 소개를 함께 안내한다.
const ONBOARDING_KEY = "onboarded_v1";
const ONBOARDING_TEXT =
  "안녕하세요. 대전 상권분석 매니저입니다.\n" +
  "대전 82개 동 상권 흐름을 AI가 근거와 함께 설명합니다.\n\n" +
  "대전 지도에서 궁금한 동을 고르고 2D와 3D로 공급 밀도를 비교해 보세요. 선택한 동의 수치를 바탕으로 질문할 수 있습니다. " +
  "아래 제안 질문을 눌러 바로 시작하셔도 됩니다.\n\n" +
  "다만 이 데이터에는 매출과 유동인구가 없습니다. 점포 수로 볼 수 있는 것까지만 말씀드리고, " +
  "알 수 없는 건 알 수 없다고 하겠습니다.";

function showOnboardingIfFirstVisit() {
  // 사생활 보호 모드나 쿠키 차단 환경에서는 localStorage 접근 자체가 예외를 던진다.
  // 온보딩 때문에 채팅 초기화가 통째로 깨지면 안 되므로 실패는 삼킨다.
  let seen = null;
  try {
    seen = window.localStorage.getItem(ONBOARDING_KEY);
  } catch (e) {
    return; // 저장할 수 없으면 매 방문 반복 노출되므로 아예 띄우지 않는다
  }
  if (seen) return;

  const bubble = appendMessage("assistant", ONBOARDING_TEXT);
  // 주제 구분선 판정에서 제외하기 위한 표시 (topics.js 참조)
  bubble.classList.add("onboarding");
  try {
    window.localStorage.setItem(ONBOARDING_KEY, "1");
  } catch (e) {
    /* 위에서 읽기가 됐다면 쓰기도 되지만, 용량 초과 등은 무시한다 */
  }
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

// A21: 대기 상태. 콜드스타트면 43초 동안 "생각하는 중..."이 멈춰 있어 사용자가
// 죽은 줄 안다. 경과 초를 1초 간격으로 갱신하고, 15초를 넘기면 무슨 일이
// 벌어지는지 밝힌다.
//
// 스피너나 애니메이션을 쓰지 않는다. 바쁜 척이 아니라 진행 상황을 사실로
// 알리는 것이 이 브랜드의 대기 처리다. 숫자만 바뀐다.
//
// 15초 문구가 "요청은 계속 진행 중입니다"인 게 핵심이다. Render 무료 티어는
// 첫 요청을 붙잡은 채 완료시키므로(실측 43초) 재시도를 권하면 오안내다.
const WAIT_BASE = "생각하는 중...";
const WAIT_COLD =
  "백엔드가 절전에서 깨어나는 중입니다. 최대 50초까지 걸릴 수 있어요. 요청은 계속 진행 중입니다.";

function startWaitTimer(bubble) {
  const startedAt = Date.now();

  function tick() {
    const elapsed = Math.floor((Date.now() - startedAt) / 1000);
    if (elapsed < 5) bubble.textContent = WAIT_BASE;
    else if (elapsed < 15) bubble.textContent = `${WAIT_BASE} (${elapsed}초)`;
    else bubble.textContent = `${WAIT_COLD} (${elapsed}초)`;
  }

  tick();
  const timerId = setInterval(tick, 1000);
  return () => clearInterval(timerId);
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

// 보내는 동안 버튼을 잠근다. 잠그지 않으면 대기 중에 눌러도 아무 일이 없어
// (sending 가드가 조용히 막는다) 사용자는 화면이 멈춘 줄로 읽는다.
function setSendingState(busy) {
  const button = document.getElementById("chat-send");
  const input = document.getElementById("chat-input");
  if (button) {
    button.disabled = busy;
    button.textContent = busy ? "보내는 중" : "보내기";
  }
  if (input) input.disabled = busy;
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
  // 저장된 AI 답변도 서식으로 그린다. 불러온 대화만 마크다운이 날것으로 보이면
  // 방금 받은 답과 달라 보인다.
  (conversation.messages || []).forEach((m) => {
    const bubble = appendMessage(m.role, m.content);
    if (m.role === "assistant") renderReply(bubble, m.content);
  });
  document.getElementById("chat-suggestions").textContent = "";
  lastNotifiedTopic = null;
}

// A14: 답변 뒤에 붙는 리포트 CTA. 여정의 종착점(산출물)을 만드는 버튼이라
// 이 서비스의 Primary Goal이다. 주제가 선택돼 있을 때만 의미가 있다.
function appendReportCta() {
  const topic = window.screenContext && window.screenContext.topic;
  if (!topic) return;

  const list = document.getElementById("chat-messages");
  const wrap = document.createElement("div");
  wrap.className = "report-cta";
  const button = document.createElement("button");
  button.textContent = "이 주제 전체 리포트 보기";
  button.addEventListener("click", () => {
    wrap.remove(); // 같은 리포트를 두 번 뽑지 않는다
    sendMessage({
      text: `${topic} 주제 전체 리포트를 작성해줘`,
      context: { topic: topic, mode: "report" },
      isReport: true,
    });
  });
  wrap.appendChild(button);
  list.appendChild(wrap);
  list.scrollTop = list.scrollHeight;
}

// A4: 답변을 그린다. 마크다운 렌더러가 없으면(로드 실패) 글자 그대로 — 서식이
// 없을 뿐 내용은 보인다.
function renderReply(bubble, text) {
  if (window.renderMarkdown) window.renderMarkdown(bubble, text);
  else bubble.textContent = text;
}

// 스트리밍 경로. 실패하면 비스트리밍으로 떨어진다.
//
// 스트리밍 중에는 **글자 그대로** 붙인다. 조각마다 마크다운을 다시 그리면 미완성
// 문법(`**중앙`)이 매번 다르게 해석돼 화면이 덜덜 떨린다. 다 받은 뒤 한 번만 그린다.
async function sendStreaming(message, context, bubble, stopWaitTimer) {
  if (!api.streamChat || typeof window.TextDecoder === "undefined") {
    const result = await api.sendChat(message, currentConversationId, context);
    renderReply(bubble, result.reply);
    return result;
  }

  let text = "";
  let started = false;
  try {
    const result = await api.streamChat(message, currentConversationId, context, (piece) => {
      // 첫 글자가 도착하면 대기 타이머를 멈춘다. 안 그러면 답변 위에 경과 초가
      // 계속 덧쓰인다.
      if (!started) {
        started = true;
        stopWaitTimer();
        bubble.textContent = "";
      }
      text += piece;
      bubble.textContent = text;
      const list = document.getElementById("chat-messages");
      list.scrollTop = list.scrollHeight;
    });
    renderReply(bubble, text);
    return result;
  } catch (err) {
    // 한 글자라도 받았으면 이미 화면에 답이 떠 있다. 여기서 다시 보내면 같은 질문에
    // 두 번 과금되고 답이 두 번 저장된다.
    if (started) throw err;
    const result = await api.sendChat(message, currentConversationId, context);
    renderReply(bubble, result.reply);
    return result;
  }
}

// options 없이 부르면 입력창의 내용을 보낸다. 리포트·재시도는 options로 넘긴다.
// 주의: 클릭 핸들러로 직접 넘기면 안 된다. Event 객체가 options 자리에 들어온다.
// 한 번에 한 요청만 보낸다. 백엔드가 대화를 읽고-고쳐-쓰는 방식이라
// (conversation_service.append_turn) 같은 대화에 두 요청이 겹치면 나중 것이 앞의 턴을
// 덮어써 대화가 통째로 사라진다. 엔터를 두 번 누르면 실제로 닿는 경로였다.
let sending = false;

async function sendMessage(options) {
  const opts = options || {};
  if (sending) return;
  const fromInput = opts.text === undefined;
  const input = document.getElementById("chat-input");
  const message = fromInput ? input.value.trim() : opts.text;
  if (!message) return;

  sending = true;
  setSendingState(true);
  if (fromInput) input.value = "";
  // A28: 화면에서 고른 목적을 함께 보낸다. 백엔드가 허용 값(explore·prepare·running)만
  // 통과시키므로 임의 값이 들어가도 조용히 무시된다.
  const base = opts.context || window.screenContext;
  const context = window.activePersona
    ? Object.assign({}, base, { persona: window.activePersona })
    : base;

  document.getElementById("chat-suggestions").textContent = "";
  // 재시도는 실패한 요청을 다시 보내는 것이지 새 질문이 아니다. 다시 붙이면
  // 같은 질문이 두 번 쌓인다.
  if (!opts.retry) appendMessage("user", message);
  if (window.switchToChatPane) window.switchToChatPane();
  const loadingBubble = appendMessage("assistant", WAIT_BASE);
  const stopWaitTimer = startWaitTimer(loadingBubble);

  try {
    // A4: 스트리밍을 먼저 시도한다. 첫 글자가 빨리 나와야 사용자가 기다릴 수 있다.
    // 실패하면(SSE를 버퍼링하는 프록시, 구형 브라우저) 기존 경로로 떨어진다 —
    // 스트리밍은 표현 방식이지 기능이 아니므로 없다고 서비스가 멈추면 안 된다.
    const result = await sendStreaming(message, context, loadingBubble, stopWaitTimer);
    currentConversationId = result.conversation_id;
    appendUsage(result.usage);
    refreshHistory();
    // 리포트 답변 뒤에 또 리포트를 권하지 않는다
    if (!opts.isReport) appendReportCta();
  } catch (err) {
    loadingBubble.remove();
    showErrorBubble(classifyError(err), () =>
      sendMessage({ text: message, context: context, isReport: opts.isReport, retry: true })
    );
  } finally {
    // 성공·실패 어느 쪽이든 반드시 멈춘다. 안 그러면 답변이 도착한 뒤에도
    // 타이머가 버블 내용을 경과 초로 덮어쓴다.
    stopWaitTimer();
    sending = false;
    setSendingState(false);
    // 전송할 때 비운 제안 질문을 되돌린다. 안 되돌리면 첫 질문 뒤로는
    // 주제를 바꾸기 전까지 다음 질문 경로가 사라진다.
    renderSuggestions();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // 화살표로 감싼다. sendMessage를 그대로 넘기면 MouseEvent가 options 자리에 들어온다.
  document.getElementById("chat-send").addEventListener("click", () => sendMessage());
  document.getElementById("chat-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
  });
  document.getElementById("chat-new").addEventListener("click", startNewConversation);
  renderSuggestions();
  showOnboardingIfFirstVisit();
});
