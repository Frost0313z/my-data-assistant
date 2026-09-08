// 출력 이스케이프 원칙: 사용자·AI가 만든 문자열(memo 등)은 innerHTML로 조립하지 않고
// createElement + textContent로만 DOM에 넣는다. 아래 렌더 함수 전체가 그 규칙을 따른다.

function makeCell(text) {
  const td = document.createElement("td");
  td.textContent = text;
  return td;
}

function makeActionCell(id) {
  const td = document.createElement("td");
  for (const [action, label] of [["edit", "수정"], ["delete", "삭제"]]) {
    const b = document.createElement("button");
    b.dataset.action = action;
    b.dataset.id = id;
    b.textContent = label;
    td.appendChild(b);
  }
  return td;
}

function setTableMessage(tbody, text) {
  tbody.innerHTML = "";
  const tr = document.createElement("tr");
  const td = document.createElement("td");
  td.colSpan = 4;
  td.textContent = text;
  tr.appendChild(td);
  tbody.appendChild(tr);
}

async function refreshDataTable() {
  const tbody = document.getElementById("data-tbody");
  setTableMessage(tbody, "불러오는 중...");
  try {
    const records = await api.listData();
    tbody.innerHTML = "";
    records.forEach((r) => {
      const tr = document.createElement("tr");
      tr.appendChild(makeCell(r.date));
      tr.appendChild(makeCell(r.value));
      tr.appendChild(makeCell(r.memo || ""));
      tr.appendChild(makeActionCell(r.id));
      tbody.appendChild(tr);
    });
  } catch (err) {
    setTableMessage(tbody, `불러오기 실패: ${err.message}`);
  }
}

async function handleDataFormSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const record = {
    date: form.date.value,
    value: Number(form.value.value),
    memo: form.memo.value,
  };
  const editingId = form.dataset.editingId;

  try {
    if (editingId) {
      await api.updateData(editingId, record);
      delete form.dataset.editingId;
      form.querySelector("button[type=submit]").textContent = "추가";
    } else {
      await api.createData(record);
    }
    form.reset();
    refreshDataTable();
    refreshSummary();
  } catch (err) {
    alert(`저장 실패: ${err.message}`);
  }
}

async function handleDataTableClick(e) {
  const button = e.target.closest("button");
  if (!button) return;
  const id = button.dataset.id;

  if (button.dataset.action === "delete") {
    if (!confirm("이 데이터를 삭제할까요?")) return;
    await api.deleteData(id);
    refreshDataTable();
    refreshSummary();
    return;
  }

  if (button.dataset.action === "edit") {
    const row = button.closest("tr");
    const [date, value, memo] = row.children;
    const form = document.getElementById("data-form");
    form.date.value = date.textContent;
    form.value.value = value.textContent;
    form.memo.value = memo.textContent;
    form.dataset.editingId = id;
    form.querySelector("button[type=submit]").textContent = "수정 저장";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("data-form").addEventListener("submit", handleDataFormSubmit);
  document.getElementById("data-tbody").addEventListener("click", handleDataTableClick);
});
