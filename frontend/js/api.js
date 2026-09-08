const api = {
  async request(path, options = {}) {
    const res = await fetch(`${window.API_BASE_URL}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || `요청 실패 (${res.status})`);
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

  // F3: 콜드 스타트 판별용 가벼운 핑
  ping() {
    return this.request("/");
  },
};
