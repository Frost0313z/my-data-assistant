async function refreshSummary() {
  const el = document.getElementById("summary-content");
  try {
    const summary = await api.getSummary();
    el.innerHTML = `
      <div class="summary-row"><span>기간</span><strong>${summary.period}</strong></div>
      <div class="summary-row"><span>레코드 수</span><strong>${summary.count}개</strong></div>
      <div class="summary-row"><span>평균</span><strong>${summary.metrics.average ?? "-"}</strong></div>
      <div class="summary-row"><span>최대 / 최소</span><strong>${summary.metrics.max ?? "-"} / ${summary.metrics.min ?? "-"}</strong></div>
      <div class="summary-row"><span>트렌드</span><strong>${summary.trend}</strong></div>
    `;
  } catch (err) {
    el.textContent = `요약을 불러오지 못했습니다: ${err.message}`;
  }
}
