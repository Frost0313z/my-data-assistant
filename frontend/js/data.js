async function refreshDataTable() {
  const tbody = document.getElementById("data-tbody");
  tbody.innerHTML = `<tr><td colspan="4">불러오는 중...</td></tr>`;
  try {
    const records = await api.listData();
    tbody.innerHTML = "";
    records.forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.date}</td>
        <td>${r.value}</td>
        <td>${r.memo || ""}</td>
        <td>
          <button data-action="edit" data-id="${r.id}">수정</button>
          <button data-action="delete" data-id="${r.id}">삭제</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4">불러오기 실패: ${err.message}</td></tr>`;
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
