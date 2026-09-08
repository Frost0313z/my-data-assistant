// 출력 이스케이프: period 문자열은 사용자가 CRUD로 넣은 date에서 조립되므로 신뢰 불가.
// innerHTML 템플릿 대신 createElement + textContent로 행을 만든다.

async function refreshSummary() {
  const el = document.getElementById("summary-content");
  try {
    const summary = await api.getSummary();
    const rows = [
      ["기간", summary.period],
      ["레코드 수", `${summary.count}개`],
      ["평균", summary.metrics.average ?? "-"],
      ["최대 / 최소", `${summary.metrics.max ?? "-"} / ${summary.metrics.min ?? "-"}`],
      ["트렌드", summary.trend],
    ];
    el.innerHTML = "";
    for (const [key, val] of rows) {
      const row = document.createElement("div");
      row.className = "summary-row";
      const span = document.createElement("span");
      span.textContent = key;
      const strong = document.createElement("strong");
      strong.textContent = val;
      row.append(span, strong);
      el.appendChild(row);
    }
  } catch (err) {
    el.textContent = `요약을 불러오지 못했습니다: ${err.message}`;
  }
}
