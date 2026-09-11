// 출력 이스케이프 원칙: 사용자·AI가 만든 문자열(memo 등)은 innerHTML로 조립하지 않고
// createElement + textContent로만 DOM에 넣는다. 아래 렌더 함수 전체가 그 규칙을 따른다.

function makeCell(text) {
  const td = document.createElement("td");
  td.textContent = text;
  return td;
}

// D5: 쓰기가 꺼진 배포에서는 버튼을 아예 만들지 않는다. 눌러 보고 403을 받는 것보다
// 없는 편이 정직하다. 서버가 최종 판단이고(이 값은 화면 안내일 뿐) 기본은 "허용"이라
// 확인 요청이 실패해도 로컬 개발이 막히지 않는다.
let writesEnabled = true;

function makeActionCell(id) {
  const td = document.createElement("td");
  if (!writesEnabled) return td;
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

// 표를 실제로 펼쳤을 때만 읽는다.
//
// 2026-09-10에 Firestore 하루 읽기 한도(5만)를 태웠다. 계기는 시드 리셋이었지만
// 구조가 따로 있었다 — 이 표는 접힌 <details> 안에, 그 <details>는 기본
// display:none인 사이드 패널 안에 있는데, 부팅마다 492건을 통째로 읽고 있었다.
// 방문자 한 명당 약 500 reads라 100명이면 하루치가 끝난다.
//
// 쓰기 경로(추가·수정·삭제)는 refreshDataTable()을 그대로 부른다. 그때는 표가
// 열려 있고 내용이 바뀐 것이 확실하므로 무조건 다시 읽는 것이 맞다.
let dataTableLoaded = false;

async function ensureDataTable() {
  const panel = document.querySelector(".data-manage");
  if (!panel || !panel.open || dataTableLoaded) return;
  await applyWriteMode();
  await refreshDataTable();
}

// 쓰기 가능 여부는 표를 펼칠 때 한 번만 묻는다. `GET /`는 Firestore를 읽지 않는다.
let writeModeChecked = false;
async function applyWriteMode() {
  if (writeModeChecked) return;
  writeModeChecked = true;
  try {
    const health = await api.ping();
    writesEnabled = health.writes_enabled !== false;
  } catch (err) {
    return; // 못 물어봤으면 그대로 둔다. 진짜 차단은 서버가 한다.
  }
  if (writesEnabled) return;
  const form = document.getElementById("data-form");
  form.hidden = true;
  document.getElementById("data-readonly").hidden = false;
}

async function refreshDataTable() {
  dataTableLoaded = true;
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
    // 실패한 것을 "읽었다"로 남기면 다시 펼쳐도 영영 재시도하지 않는다.
    dataTableLoaded = false;
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
  // toggle은 열 때도 닫을 때도 오지만 ensureDataTable이 열린 경우만 통과시킨다.
  document.querySelector(".data-manage").addEventListener("toggle", ensureDataTable);
});
