// 이 브라우저의 칸막이 키. 로그인이 아니라 **남의 대화를 못 보게 하는 장치**다.
//
// 전에는 서버가 대화 목록을 통째로 돌려줘서, 공개 URL에서 방문자 A가 B의 질문을
// 읽고 지울 수 있었다(2026-09-10 관측). 이제 서버가 이 값으로 칸을 나눈다.
//
// 사생활 보호 모드에서 localStorage가 막히면 빈 값이 된다 — 그때는 대화가
// 목록에 남지 않는다. 조용히 남의 것을 보게 되는 것보다 낫다.
const CLIENT_KEY = "client_v1";
function clientId() {
  try {
    let id = window.localStorage.getItem(CLIENT_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(CLIENT_KEY, id);
    }
    return id;
  } catch (e) {
    return "";
  }
}

const api = {
  clientId,
  async request(path, options = {}) {
    const res = await fetch(`${window.API_BASE_URL}${path}`, {
      ...options,
      // 스프레드 뒤에 둔다. 앞에 두면 options.headers가 통째로 덮어써
      // 칸막이 키가 조용히 빠진다.
      headers: { "Content-Type": "application/json", "X-Client-Id": clientId(), ...(options.headers || {}) },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const error = new Error(body.detail || `요청 실패 (${res.status})`);
      // C3: 429는 고장이 아니라 정책이다. 화면이 다르게 말해야 한다.
      if (res.status === 429) error.rateLimited = true;
      throw error;
    }
    if (res.status === 204) return null;
    return res.json();
  },

  getSummary() {
    return this.request("/api/data/summary");
  },
  listData() {
    return this.request("/api/data");
  },
  createData(record) {
    return this.request("/api/data", { method: "POST", body: JSON.stringify(record) });
  },
  updateData(id, record) {
    return this.request(`/api/data/${id}`, { method: "PUT", body: JSON.stringify(record) });
  },
  deleteData(id) {
    return this.request(`/api/data/${id}`, { method: "DELETE" });
  },

  listConversations() {
    return this.request("/api/conversations");
  },
  getConversation(id) {
    return this.request(`/api/conversations/${id}`);
  },
  deleteConversation(id) {
    return this.request(`/api/conversations/${id}`, { method: "DELETE" });
  },

  sendChat(message, conversationId, context) {
    return this.request("/api/chat", {
      method: "POST",
      body: JSON.stringify({
        message,
        conversation_id: conversationId || null,
        context: context || null,
      }),
    });
  },

  // A4: 토큰이 오는 대로 받는다. onDelta(조각)을 부르고, 끝나면 {conversation_id, usage}를 돌려준다.
  //
  // EventSource를 안 쓰는 이유: GET만 되고 본문을 못 싣는다. 여기서는 메시지와 화면
  // 컨텍스트를 POST로 보내야 한다.
  async streamChat(message, conversationId, context, onDelta, signal) {
    const res = await fetch(`${window.API_BASE_URL}/api/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Client-Id": clientId() },
      body: JSON.stringify({
        message,
        conversation_id: conversationId || null,
        context: context || null,
      }),
      signal,
    });
    if (!res.ok || !res.body) {
      const body = await res.json().catch(() => ({}));
      const error = new Error(body.detail || `요청 실패 (${res.status})`);
      if (res.status === 429) error.rateLimited = true;
      throw error;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let result = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE는 빈 줄로 이벤트를 가른다. 마지막 조각은 아직 덜 왔을 수 있으니 남겨 둔다.
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop();
      for (const block of blocks) {
        const event = /^event: (.*)$/m.exec(block);
        const data = /^data: (.*)$/m.exec(block);
        if (!event || !data) continue;
        const payload = JSON.parse(data[1]);
        if (event[1] === "delta") onDelta(payload);
        else if (event[1] === "done") result = payload;
        else if (event[1] === "error") throw new Error("AI 응답 생성에 실패했습니다.");
      }
    }
    // done 없이 끝났으면 중간에 끊긴 것이다. 조용히 성공으로 넘기면 저장 안 된 답을
    // 저장된 것처럼 보여주게 된다.
    if (!result) throw new Error("응답이 도중에 끊겼습니다.");
    return result;
  },

  // F3: 콜드 스타트 판별용 가벼운 핑
  ping() {
    return this.request("/");
  },
};

// C6: 페이지가 열리는 순간 백엔드를 깨우기 시작한다.
//
// Render 무료 티어는 15분 놀면 자고 깨는 데 43초(실측)가 걸린다. 예약 크론을
// 두긴 했지만 GitHub의 schedule은 심하게 밀려 **실측 2~4시간 간격**으로 돈다 —
// 사실상 예열이 되지 않는다. 그래서 진짜 예열은 여기서 한다.
//
// 사람은 지도를 먼저 보고 한참 뒤에 질문한다. 그 사이에 서버가 깨면 첫 질문은
// 기다림 없이 답한다.
//
// "읽기도 비용이다"에 걸리지 않는다 — `GET /`는 Firestore를 건드리지 않고
// (읽기 0건) C4 로그에서도 제외돼 있다. 실패는 무시한다. 이건 예열이지
// 상태 확인이 아니라서, 못 깨워도 화면이 할 일은 달라지지 않는다.
api.ping().catch(() => {});
