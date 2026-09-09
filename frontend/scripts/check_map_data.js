// 지도 데이터가 화면이 기대하는 모양인지 확인한다. `node scripts/check_map_data.js`
//
// build_map_data.py는 만들 때 검사하지만, 만들어진 파일은 커밋되어 따로 산다.
// 손으로 고치거나 병합이 어긋나도 화면에서는 색이 좀 이상할 뿐이라 안 보인다.
const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "..", "data");
const read = (name) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf-8"));

const map = read("daejeon-map.json");
const points = read("daejeon-points.json");

const codes = new Set(map.boundaries.features.map((f) => f.properties.dong_code));
if (codes.size !== 82) throw new Error(`행정동 경계가 중복 없이 82개여야 합니다 (현재 ${codes.size})`);

for (const period of map.periods) {
  const rows = map.metrics[period];
  if (!rows || rows.length !== 82) throw new Error(`${period} 지표 행이 82개가 아닙니다`);
  for (const row of rows) {
    if (!codes.has(row.dong_code)) throw new Error(`경계에 없는 행정동: ${row.dong_code}`);
    // A23이 쓰는 지표. 하나라도 빠지면 그 지표 선택 시 지도가 통째로 비어 보인다.
    for (const key of ["density", "stores", "survival", "hhi"]) {
      if (typeof row[key] !== "number") throw new Error(`${period} ${row.dong}의 ${key}가 숫자가 아닙니다`);
    }
  }
}

const sum = points.points.reduce((acc, row) => acc + row[3], 0);
if (sum !== points.total) throw new Error(`점 합계 불일치: ${sum} vs ${points.total}`);
if (points.points.some((r) => r[2] < 0 || r[2] >= points.categories.length)) {
  throw new Error("업종 인덱스가 범위를 벗어났습니다");
}

console.log(
  `지도 데이터 OK — 82개 동 × ${map.periods.length}시점 · ` +
    `점 ${points.points.length}개(합계 ${sum.toLocaleString("ko-KR")}) · 업종 ${points.categories.length}종`
);
