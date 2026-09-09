const api = {
  async request(path, options = {}) {
    const res = await fetch(`${window.API_BASE_URL}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
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
      headers: { "Content-Type": "application/json" },
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
