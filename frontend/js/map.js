// 기존 대시보드의 대전 경계와 지표를 재사용한다. 높이는 건물이 아닌 공급 밀도다.
(async function () {
  const $ = (id) => document.getElementById(id);
  const period = $("map-period"), district = $("map-district"), dong = $("map-dong");
  const metricSelect = $("map-metric");
  const status = $("map-status"), host = $("daejeon-map");
  const viewButtons = [...document.querySelectorAll("[data-map-view]")];
  const css = getComputedStyle(document.documentElement);
  const color = (name) => css.getPropertyValue(name).trim();
  const colors = [1, 2, 3, 4, 5].map((n) => color(`--map-level-${n}`));
  const typeColors = [1, 2, 3, 4, 5].map((n) => color(`--map-type-${n}`));

  // A26: 지역 유형. 점수가 아니라 유형이다 — 어느 칸도 다른 칸보다 낫지 않다.
  //
  // 밀도와 교체율을 각각 중앙값에서 잘라 2×2로 놓는다. 두 축을 고른 이유는 이 데이터로
  // 답할 수 있는 질문이 "가게가 얼마나 있나"와 "얼마나 오래 남나" 둘뿐이기 때문이다.
  // 합성 점수를 만들지 않는 이유는 decisions.md 설계 판단에 있다 — 밀도는 9.4~596.6으로
  // 퍼져 있고 나머지는 좁은 폭에 몰려 있어 가중합이 사실상 밀도 하나짜리가 된다.
  //
  // 이름은 전부 묘사다. "유망"·"침체"처럼 좋고 나쁨을 말하는 낱말은 쓸 수 없다 —
  // 매출이 없어서 그 판단을 할 자격이 없다.
  // key는 백엔드 화이트리스트 값이다. 유형은 우리가 만든 구분이라 AI가 알 수 없어,
  // 고른 유형을 함께 보내지 않으면 "좋은 지역 유형입니다" 같은 답이 나온다(실측).
  // 설명 문구는 백엔드가 갖는다 — 프론트가 임의 문자열을 넣으면 프롬프트 주입 표면이 된다.
  const TYPES = [
    { key: "dense_stable", label: "촘촘하고 자리잡은 곳", hint: "주민 수에 비해 가게가 많고, 교체가 평균보다 적습니다." },
    { key: "dense_churn", label: "촘촘하고 자주 바뀌는 곳", hint: "주민 수에 비해 가게가 많고, 교체가 평균보다 잦습니다." },
    { key: "sparse_stable", label: "성기고 자리잡은 곳", hint: "주민 수에 비해 가게가 적고, 교체가 평균보다 적습니다." },
    { key: "sparse_churn", label: "성기고 자주 바뀌는 곳", hint: "주민 수에 비해 가게가 적고, 교체가 평균보다 잦습니다." },
    { key: "aside", label: "따로 봐야 하는 곳", hint: "두 축 중 하나를 믿을 수 없어 유형에 넣지 않았습니다." },
  ];
  const ASIDE = 4;

  // A23: 지표마다 범위와 단위가 다르다.
  //
  // 밀도만 고정 구간을 쓴다 — 40/60/100/200은 원본 대시보드와 같은 경계라
  // 두 화면이 같은 색을 같은 뜻으로 쓴다.
  //
  // 나머지는 분위(5분위) 구간이다. 고정 구간을 쓰면 안 되는 이유가 실측에 있다 —
  // HHI는 82개 중 절반이 0.18~0.22의 0.04 폭에, 잔존율은 절반이 3.4%p 폭에 몰려 있다.
  // 균등 구간으로 자르면 대부분이 한 칸에 들어가 아무것도 구분되지 않는다.
  // 분위는 반대로 극단값이 화면을 지배하는 것도 막는다(교체율 월평3동 141.6%).
  const METRICS = {
    density: {
      label: "공급 밀도", legend: "인구 1,000명당 등록 업소 수",
      unit: "개", digits: 1, fixed: [40, 60, 100, 200],
      note: "생활권 행정동은 대체로 20~40개 수준입니다(효동 40.3 · 판암1동 34.1 · 판암2동 21.1). 원도심은 방문 수요를 상주인구로 나눠 높게 나오므로 과밀이나 성공으로 단정할 수 없습니다.",
    },
    stores: {
      label: "등록 업소 수", legend: "행정동별 등록 업소 수",
      unit: "개", digits: 0,
      note: "밀도와 함께 보십시오. 밀도는 상주인구로 나눈 값이라 원도심에서 커집니다. 중앙동은 밀도 1위지만 실제 개수로는 전체의 2.4%입니다.",
    },
    survival: {
      label: "점포 잔존율", legend: "고정 코호트 잔존율",
      unit: "%", digits: 1,
      note: "행정동 평균 약 86%, 최저 목동 73.7%, 최고 중앙동 90.3%. 공급 밀도 1·2위(중앙동·대흥동)가 오히려 평균 이상으로 안정적입니다 — 밀도가 높다고 불안정한 것은 아닙니다.",
    },
    turnover: {
      label: "점포 교체율", legend: "교체율 (이탈 + 진입) ÷ 시작 업소 수",
      unit: "%", digits: 1, allPeriods: true,
      note: "전 기간 누적이라 기준 시점을 바꿔도 값이 같습니다. 업소 수가 적은 동은 분모가 작아 크게 흔들립니다(월평3동 141.6%, 업소 184개).",
    },
    hhi: {
      label: "업종 집중도", legend: "업종 집중도 HHI (낮을수록 다양)",
      unit: "", digits: 3,
      note: "입지계수(LQ)와는 다른 지표입니다. 기성동 숙박업은 LQ 19.2지만 35개뿐이고, 중앙동 음식점업은 LQ 0.73(평균 이하)인데 1,000명당 125개로 최다입니다. 비율만으로 시장 크기를 판단하면 안 됩니다.",
    },
    type: {
      label: "지역 유형", legend: "밀도 × 교체율 4유형",
      unit: "", digits: 0, categorical: true,
      note: "점수가 아니라 유형입니다 — 어느 칸도 다른 칸보다 낫지 않습니다. 두 축 모두 그 시점 82개 동의 중앙값에서 자릅니다. 업소가 200개 미만이면 교체율이 분모 때문에 크게 흔들리고, 밀도가 75분위의 3배를 넘으면 상주인구 나눗셈이 만든 값이라 어느 쪽도 유형에 넣지 않습니다.",
    },
  };
  const METRIC_KEYS = Object.keys(METRICS);

  // 유형 경계는 그 시점 82개 동에서 매번 다시 잡는다. 값을 코드에 박아두면
  // 시점을 바꿨을 때 조용히 어긋난다.
  function typeCuts() {
    const all = rows();
    const at = (key, p) => {
      const v = all.map((r) => r[key]).filter((x) => x !== null && x !== undefined).sort((a, b) => a - b);
      return v[Math.min(v.length - 1, Math.round(p * (v.length - 1)))];
    };
    return { density: at("density", 0.5), turnover: at("turnover", 0.5), overDense: at("density", 0.75) * 3 };
  }
  // 소수 자릿수를 고정한다. 32%와 32.0%가 섞이면 같은 줄에서 다른 정밀도로 읽힌다.
  const num = (v, d) =>
    v.toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d });
  // 왜 유형에서 뺐는지 — 화면에 그대로 적을 문장을 함께 돌려준다.
  function asideReason(row, cuts) {
    if (row.density > cuts.overDense) {
      return `밀도가 75분위의 3배(${num(cuts.overDense, 1)})를 넘습니다 — 상주인구로 나눈 값이라 원도심에서 과대해집니다.`;
    }
    if (row.stores < 200) {
      return `등록 업소가 ${num(row.stores, 0)}개뿐이라 교체율의 분모가 작습니다.`;
    }
    return "";
  }
  function typeIndex(row, cuts) {
    if (row.turnover === null || row.turnover === undefined) return ASIDE;
    if (asideReason(row, cuts)) return ASIDE;
    return (row.density >= cuts.density ? 0 : 2) + (row.turnover >= cuts.turnover ? 1 : 0);
  }

  const categorySelect = $("map-category");
  let map, data, points = null, selected = "", view = "3d", ready = false, fallback = false;
  let metric = "density";
  let breaks = METRICS.density.fixed;

  const spec = () => METRICS[metric];
  // 범주형은 색이 순서를 뜻하지 않으므로 램프 대신 별도 팔레트를 쓴다.
  const palette = () => (spec().categorical ? typeColors : colors);
  const fmt = (v) =>
    v === null || v === undefined
      ? "-"
      : spec().categorical
        ? TYPES[v].label
        : `${v.toLocaleString("ko-KR", { maximumFractionDigits: spec().digits })}${spec().unit}`;
  const colorFor = (v) => (v === null || v === undefined ? color("--map-canvas") : palette()[breaks.filter((b) => v >= b).length]);

  // 지표 값. 유형은 데이터에 없고 두 지표에서 계산한다.
  function valueOf(row, cuts) {
    return spec().categorical ? typeIndex(row, cuts || typeCuts()) : row[metric];
  }

  // 분위 구간. 값이 몰려 있어 경계가 겹치면 중복을 제거한다(구간 수가 줄 뿐 색은 어긋나지 않는다).
  function computeBreaks() {
    const s = spec();
    // 범주형은 0~4 인덱스를 그대로 칸으로 쓴다. 같은 step 표현식을 재사용한다.
    if (s.categorical) return [0.5, 1.5, 2.5, 3.5];
    if (s.fixed) return s.fixed;
    const v = rows().map((r) => r[metric]).filter((x) => x !== null && x !== undefined).sort((a, b) => a - b);
    if (!v.length) return [];
    const at = (p) => v[Math.min(v.length - 1, Math.round(p * (v.length - 1)))];
    return [...new Set([at(0.2), at(0.4), at(0.6), at(0.8)])];
  }

  function coordinates(geometry) {
    return geometry.coordinates.flat(geometry.type === "MultiPolygon" ? 2 : 1);
  }
  function bounds(features) {
    const points = features.flatMap((f) => coordinates(f.geometry));
    return [[Math.min(...points.map((p) => p[0])), Math.min(...points.map((p) => p[1]))],
      [Math.max(...points.map((p) => p[0])), Math.max(...points.map((p) => p[1]))]];
  }
  function rows() { return data.metrics[period.value]; }
  // 선택된 지표를 항상 'value'로 실어 보낸다. 그래야 레이어 표현식이 지표와 무관해진다.
  function features() {
    const cuts = spec().categorical ? typeCuts() : null;
    const values = new Map(rows().map((r) => [r.dong_code, valueOf(r, cuts)]));
    return data.boundaries.features.map((f) => ({
      ...f,
      properties: { ...f.properties, value: values.get(f.properties.dong_code) ?? null },
    }));
  }

  // A24: 행정동 이름 라벨.
  //
  // symbol 레이어를 쓰지 않는 이유: text-field는 glyphs URL을 요구하는데, 이 지도는
  // 스타일에 외부 소스를 하나도 두지 않아(네트워크 0) 글리프를 받아올 곳이 없다.
  // 자치구 라벨이 이미 Marker로 동작하고 있으므로 같은 방식을 쓴다.
  //
  // 대신 충돌 회피를 직접 해야 한다. 82개를 한꺼번에 띄우면 서로 겹쳐 못 읽으므로,
  // 폴리곤이 화면에서 충분히 클 때만 이름을 보인다 — 줌아웃하면 자연히 솎아진다.
  const dongLabels = [];
  const LABEL_MIN_PX = 46;

  function buildDongLabels() {
    for (const f of data.boundaries.features) {
      const el = document.createElement("span");
      el.className = "map-dong-label";
      el.textContent = f.properties.dong;
      el.hidden = true;
      const box = bounds([f]);
      new maplibregl.Marker({ element: el })
        .setLngLat([(box[0][0] + box[1][0]) / 2, (box[0][1] + box[1][1]) / 2])
        .addTo(map);
      dongLabels.push({ code: f.properties.dong_code, district: f.properties.district, box, el });
    }
    map.on("moveend", updateDongLabels);
    updateDongLabels();
  }

  function updateDongLabels() {
    if (!ready) return;
    for (const label of dongLabels) {
      const inDistrict = !district.value || label.district === district.value;
      const a = map.project(label.box[0]);
      const b = map.project(label.box[1]);
      const roomy = Math.min(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) >= LABEL_MIN_PX;
      // 선택한 동은 작아도 항상 보인다 — 지금 보고 있는 곳의 이름이 사라지면 안 된다.
      const isSelected = label.code === selected;
      label.el.hidden = !(inDistrict && (roomy || isSelected));
      label.el.classList.toggle("is-selected", isSelected);
    }
  }

  // A25: 업종별 점포 위치. 코로플레스는 '행정동 평균'이라 상권 덩어리가 안 보인다.
  // 상권은 행정동 경계를 따라 생기지 않으므로 실제 좌표를 겹쳐 보여준다.
  function pointFeatures() {
    if (!points) return { type: "FeatureCollection", features: [] };
    return {
      type: "FeatureCollection",
      features: points.points.map(([lon, lat, category, count]) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [lon, lat] },
        properties: { category, count },
      })),
    };
  }

  function updatePoints() {
    if (!ready || !points) return;
    const value = categorySelect.value;
    const on = value !== "";
    map.setLayoutProperty("category-points", "visibility", on ? "visible" : "none");
    // "all"이면 전 업종, 아니면 해당 업종 인덱스만
    map.setFilter("category-points", on && value !== "all" ? ["==", ["get", "category"], Number(value)] : null);

    // 점은 최신 1시점만 담았다. 기준 시점을 바꿔도 점이 안 움직이는 걸 숨기지 않는다.
    const note = $("map-points-note");
    if (note) {
      note.hidden = !on;
      note.textContent = on
        ? `업종 점은 ${points.period.slice(0, 7)} 기준입니다. 기준 시점을 바꿔도 점 위치는 그대로입니다. 점 크기는 그 자리의 점포 수입니다.`
        : "";
    }
  }

  function renderLegend() {
    const box = $("map-legend");
    if (!box) return;
    const s = spec();
    box.replaceChildren();
    const title = document.createElement("strong");
    title.textContent = s.legend;
    box.append(title);
    if (s.categorical) {
      TYPES.forEach((t, i) => {
        const span = document.createElement("span");
        const swatch = document.createElement("i");
        swatch.className = `map-swatch map-type-${i + 1}`;
        span.title = t.hint;
        span.append(swatch, document.createTextNode(t.label));
        box.append(span);
      });
    } else {
      const edges = ["", ...breaks.map(fmt)];
      breaks.concat([null]).forEach((_, i) => {
        const span = document.createElement("span");
        const swatch = document.createElement("i");
        swatch.className = `map-swatch map-level-${i + 1}`;
        span.append(swatch, document.createTextNode(
          i === 0 ? `${edges[1]} 미만`
            : i === breaks.length ? `${edges[i]} 이상`
              : `${edges[i]}–${edges[i + 1]}`));
        box.append(span);
      });
    }
    // 해설은 범례가 아니라 지도 아래 별도 줄에 둔다. 범례에 섞으면 색 읽기를 방해한다.
    const insight = $("map-insight");
    if (insight) insight.textContent = s.note || "";
  }
  function visibleFeatures() {
    return data.boundaries.features.filter((f) => !district.value || f.properties.district === district.value);
  }
  function syncContext() {
    const row = rows().find((r) => r.dong_code === selected);
    const when = spec().allPeriods ? data.turnoverRange.map((p) => p.slice(0, 7)).join(" → ") : period.value.slice(0, 7);
    const label = `${spec().label} · ${when}${row ? ` · ${row.district} ${row.dong}` : " · 대전 전체"}`;
    const regionType = row && spec().categorical ? TYPES[typeIndex(row, typeCuts())].key : "";
    if (window.focusMapAnalysis) window.focusMapAnalysis(label, metric, regionType);
  }
  // A26: 유형 하나만 던지면 "왜"가 없다. 판정에 쓴 두 값과 그때의 기준선을 같이 적는다.
  // 유형에 넣지 않은 동은 유형 대신 뺀 이유를 적는다 — 빈칸으로 두면 데이터가 없는 건지
  // 우리가 못 정한 건지 알 수 없다.
  function describeType(row, when) {
    const cuts = typeCuts();
    const idx = typeIndex(row, cuts);
    const basis =
      `밀도 ${num(row.density, 1)} (중앙 ${num(cuts.density, 1)})` +
      ` · 교체율 ${row.turnover === null ? "-" : num(row.turnover, 1) + "%"} (중앙 ${num(cuts.turnover, 1)}%)` +
      ` · 등록 업소 ${num(row.stores, 0)}개`;
    const reason = idx === ASIDE ? ` ${asideReason(row, cuts) || "교체율 값이 없습니다."}` : "";
    return `${when} · ${TYPES[idx].label} — ${TYPES[idx].hint}${reason} ${basis}`;
  }
  function showSelection() {
    const row = rows().find((r) => r.dong_code === selected);
    const when = spec().allPeriods ? data.turnoverRange.map((p) => p.slice(0, 7)).join(" → ") : period.value.slice(0, 7);
    $("map-selection-name").textContent = row ? `${row.district} ${row.dong}` : "어느 동이 궁금하세요?";
    $("map-selection-value").textContent = row
      ? spec().categorical ? describeType(row, when)
        // 밀도만 볼 때 원도심이 과대해 보이는 문제가 있어 업소 수를 항상 함께 적는다.
        : `${when} · ${spec().legend} ${fmt(row[metric])}` +
          (metric === "stores" ? "" : ` · 등록 업소 ${row.stores.toLocaleString("ko-KR")}개`)
      : "지도나 행정동 목록에서 지역을 선택해 주세요.";
    $("map-ask").disabled = !row;
    dong.value = selected;
    if (ready) {
      map.setFilter("selected-dong", ["==", ["get", "dong_code"], selected]);
      updateDongLabels();
    }
    if (fallback) renderFallback();
    syncContext();
  }
  function fit(featuresToFit) {
    if (!ready) return;
    map.fitBounds(bounds(featuresToFit), { padding: 44, maxZoom: 14, duration: 0 });
  }
  function selectDong(code, zoom = false) {
    selected = code;
    showSelection();
    if (zoom && code) fit(data.boundaries.features.filter((f) => f.properties.dong_code === code));
  }
  function updateDongOptions() {
    dong.replaceChildren(new Option("지도에서 선택", ""));
    visibleFeatures().sort((a, b) => `${a.properties.district} ${a.properties.dong}`.localeCompare(`${b.properties.district} ${b.properties.dong}`, "ko"))
      .forEach((f) => dong.add(new Option(`${f.properties.district} ${f.properties.dong}`, f.properties.dong_code)));
  }
  // 색·높이 표현식을 현재 지표 구간으로 다시 만든다. 지표마다 값의 크기가 달라
  // (HHI 0.15~0.44 vs 업소 수 135~3,444) 3D 높이는 최대값 기준으로 정규화한다.
  function paint() {
    if (!ready) return;
    const ramp = palette();
    const fill = ["step", ["get", "value"], ramp[0], ...breaks.flatMap((b, i) => [b, ramp[i + 1]])];
    map.setPaintProperty("density-2d", "fill-color", fill);
    map.setPaintProperty("density-3d", "fill-extrusion-color", fill);
    // 범주형은 높이가 뜻을 가질 수 없다. 유형 번호를 높이로 세우면 4번이 1번보다
    // 큰 값이라는 거짓말이 된다. 전부 같은 높이로 눕히고 색만 읽게 한다.
    if (spec().categorical) {
      map.setPaintProperty("density-3d", "fill-extrusion-height", 900);
      return;
    }
    const max = Math.max(...rows().map((r) => r[metric] ?? 0), 1);
    map.setPaintProperty("density-3d", "fill-extrusion-height", ["*", ["coalesce", ["get", "value"], 0], 3500 / max]);
  }
  function updateMap() {
    breaks = computeBreaks();
    renderLegend();
    if (ready) {
      map.getSource("dongs").setData({ type: "FeatureCollection", features: features() });
      const filter = district.value ? ["==", ["get", "district"], district.value] : null;
      ["density-2d", "density-3d", "dong-lines"].forEach((id) => map.setFilter(id, filter));
      paint();
    }
    if (fallback) renderFallback();
    showSelection();
  }
  // 지표 이름이 5종이라 "을(를)"이 화면에 그대로 노출된다. 받침으로 골라 준다.
  function withObjectParticle(word) {
    const code = word.charCodeAt(word.length - 1) - 0xac00;
    const hasFinal = code >= 0 && code <= 11171 && code % 28 !== 0;
    return word + (hasFinal ? "을" : "를");
  }
  function setView(mode) {
    view = mode;
    viewButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mapView === mode)));
    const metricLabel = withObjectParticle(spec().label);
    $("map-view-note").textContent = spec().categorical
      ? "지역 유형은 색으로만 구분합니다. 유형에는 순서가 없어 3D 높이를 쓰지 않습니다."
      : mode === "3d"
        ? `3D 높이는 ${metricLabel} 표현합니다. 실제 건물 높이가 아닙니다.`
        : `2D 색은 ${metricLabel} 표현합니다. 3D와 같은 데이터·구간을 사용합니다.`;
    if (!ready) return;
    map.setLayoutProperty("density-2d", "visibility", mode === "2d" ? "visible" : "none");
    map.setLayoutProperty("density-3d", "visibility", mode === "3d" ? "visible" : "none");
    map.easeTo({ pitch: mode === "3d" ? 50 : 0, bearing: mode === "3d" ? -15 : 0,
      duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 200 });
  }

  // WebGL/CDN을 사용할 수 없어도 동일한 실제 경계로 2D 탐색을 제공한다.
  function renderFallback() {
    const ns = "http://www.w3.org/2000/svg";
    const box = bounds(visibleFeatures());
    const midLat = (box[0][1] + box[1][1]) / 2;
    const ratio = Math.cos(midLat * Math.PI / 180);
    const width = (box[1][0] - box[0][0]) * ratio, height = box[1][1] - box[0][1];
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `-0.015 -0.015 ${width + .03} ${height + .03}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `대전 ${spec().label} 2D 지도. 위 행정동 목록으로도 선택할 수 있습니다.`);
    for (const f of features().filter((f) => !district.value || f.properties.district === district.value)) {
      const polygons = f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [f.geometry.coordinates];
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", polygons.flatMap((polygon) => polygon.map((ring) => ring.map((p, i) =>
        `${i ? "L" : "M"}${(p[0] - box[0][0]) * ratio},${box[1][1] - p[1]}`).join(" ") + "Z")).join(" "));
      path.setAttribute("fill", colorFor(f.properties.value));
      path.setAttribute("fill-rule", "evenodd");
      path.setAttribute("stroke", f.properties.dong_code === selected ? color("--caution") : color("--surface"));
      path.setAttribute("stroke-width", f.properties.dong_code === selected ? ".0015" : ".0004");
      const title = document.createElementNS(ns, "title");
      title.textContent = `${f.properties.district} ${f.properties.dong} · ${spec().label} ${fmt(f.properties.value)}`;
      path.append(title);
      path.addEventListener("click", () => selectDong(f.properties.dong_code));
      svg.append(path);
    }
    host.replaceChildren(svg);
  }
  function useFallback() {
    if (fallback) return;
    ready = false;
    if (map) { map.remove(); map = null; }
    fallback = true;
    status.hidden = false;
    status.textContent = "이 환경에서는 2D 지도를 제공합니다. 3D는 WebGL 지원 브라우저에서 사용할 수 있습니다.";
    viewButtons.find((b) => b.dataset.mapView === "3d").disabled = true;
    setView("2d");
    renderFallback();
  }

  try {
    // A25 점 데이터는 54KB뿐이라 따로 지연 로드하지 않고 같이 받는다. 비용은 다운로드가
    // 아니라 렌더인데, 레이어를 숨겨두면 그것도 들지 않는다.
    const [response, pointsResponse] = await Promise.all([
      fetch("data/daejeon-map.json"),
      fetch("data/daejeon-points.json").catch(() => null),
    ]);
    if (!response.ok) throw new Error("지도 데이터 응답 실패");
    data = await response.json();
    points = pointsResponse && pointsResponse.ok ? await pointsResponse.json() : null;
    data.periods.forEach((p) => period.add(new Option(p.slice(0, 7), p)));
    period.value = data.periods.at(-1);
    METRIC_KEYS.forEach((k) => metricSelect.add(new Option(METRICS[k].label, k)));
    metricSelect.value = metric;
    if (points) {
      categorySelect.add(new Option(`전체 (${points.total.toLocaleString("ko-KR")}개)`, "all"));
      points.categories.forEach((name, i) => categorySelect.add(new Option(name, String(i))));
      categorySelect.addEventListener("change", updatePoints);
    } else {
      categorySelect.disabled = true;
    }
    [...new Set(rows().map((r) => r.district))].sort().forEach((d) => district.add(new Option(d, d)));
    updateDongOptions();
    [metricSelect, period, district, dong, $("map-reset"), ...viewButtons].forEach((e) => { e.disabled = false; });
    if (points) categorySelect.disabled = false;
    function applyMetric(next) {
      if (!METRICS[next]) return;
      metric = next;
      metricSelect.value = next;
      // 교체율은 전 기간 누적이라 기준 시점이 의미가 없다. 고르지 못하게 막아 오해를 줄인다.
      period.disabled = !!spec().allPeriods;
      setView(view); // 안내 문구를 현재 지표로 갱신
      updateMap();
    }
    metricSelect.addEventListener("change", () => applyMetric(metricSelect.value));
    // A9·A28: 목적 카드가 지도 지표를 바꿀 수 있게 연다.
    window.setMapMetric = applyMetric;
    // topics.js가 이 파일보다 먼저 돌아 저장된 페르소나를 복원했을 수 있다.
    if (window.pendingMapMetric) {
      applyMetric(window.pendingMapMetric);
      window.pendingMapMetric = null;
    }
    period.addEventListener("change", updateMap);
    district.addEventListener("change", () => { selected = ""; updateDongOptions(); updateMap(); fit(visibleFeatures()); });
    dong.addEventListener("change", () => selectDong(dong.value, true));
    viewButtons.forEach((b) => b.addEventListener("click", () => setView(b.dataset.mapView)));
    $("map-reset").addEventListener("click", () => {
      district.value = ""; selected = ""; updateDongOptions(); updateMap(); fit(visibleFeatures());
    });
    $("map-ask").addEventListener("click", () => {
      const row = rows().find((r) => r.dong_code === selected);
      if (!row) return;
      syncContext();
      $("chat-input").value = `${period.value.slice(0, 7)} 지도에서 ${row.district} ${row.dong}의 인구 1,000명당 등록 업소 수는 ${row.density}개야. 이 공급 밀도를 어떻게 읽어야 하고, 이 데이터로 알 수 없는 것은 무엇이야?`;
      if (window.switchToChatPane) window.switchToChatPane();
      $("chat-input").focus();
    });
    syncContext();
    if (!window.maplibregl) { useFallback(); return; }
    try {
      map = new maplibregl.Map({ container: host, style: { version: 8, sources: {}, layers: [
        { id: "background", type: "background", paint: { "background-color": color("--map-canvas") } },
      ] }, bounds: bounds(data.boundaries.features), fitBoundsOptions: { padding: 44 },
      maxBounds: bounds(data.boundaries.features), maxZoom: 15, pitch: 50, bearing: -15,
      renderWorldCopies: false, attributionControl: false, cooperativeGestures: true,
      locale: {
        "Map.Title": "대전 상권 지도", "Marker.Title": "자치구 이름",
        "NavigationControl.ZoomIn": "지도 확대", "NavigationControl.ZoomOut": "지도 축소",
        "NavigationControl.ResetBearing": "북쪽으로 방향 맞추기",
        "AttributionControl.ToggleAttribution": "지도 출처 보기",
        "CooperativeGesturesHandler.WindowsHelpText": "Ctrl 키를 누른 채 스크롤하면 지도가 확대됩니다",
        "CooperativeGesturesHandler.MacHelpText": "⌘ 키를 누른 채 스크롤하면 지도가 확대됩니다",
        "CooperativeGesturesHandler.MobileHelpText": "두 손가락으로 지도를 이동하세요",
      } });
    } catch (error) { useFallback(); return; }
    window.daejeonMap = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: "대전 상권 분석 · 행정동 경계 / 구 경계 © OpenStreetMap" }));
    map.on("webglcontextlost", useFallback);
    map.on("error", () => {
      status.hidden = false;
      status.textContent = "지도 표시 중 오류가 발생했습니다. 페이지를 새로고침해 주세요.";
    });
    map.on("load", () => {
      // 색·높이는 지표에 따라 달라지므로 여기서는 자리만 잡고 paint()가 채운다.
      const fill = ["step", ["get", "value"], colors[0], ...breaks.flatMap((b, i) => [b, colors[i + 1]])];
      map.addSource("dongs", { type: "geojson", data: { type: "FeatureCollection", features: features() } });
      map.addSource("districts", { type: "geojson", data: data.districts });
      map.addLayer({ id: "density-2d", type: "fill", source: "dongs", layout: { visibility: "none" }, paint: { "fill-color": fill } });
      map.addLayer({ id: "density-3d", type: "fill-extrusion", source: "dongs", paint: {
        "fill-extrusion-color": fill, "fill-extrusion-height": ["*", ["coalesce", ["get", "value"], 0], 6], "fill-extrusion-opacity": .96,
      } });
      map.addLayer({ id: "dong-lines", type: "line", source: "dongs", paint: { "line-color": color("--surface"), "line-width": .7 } });
      map.addLayer({ id: "district-lines", type: "line", source: "districts", paint: { "line-color": color("--primary"), "line-width": 1.2 } });
      // A25: 점은 코로플레스 위에 얹는다. 색은 --caution(앰버)을 쓴다 — 밀도 램프가
      // 파란 계열이라 파란 점은 배경에 묻히고, 새 색을 만들지 않아도 된다.
      if (points) {
        map.addSource("points", { type: "geojson", data: pointFeatures() });
        map.addLayer({
          id: "category-points", type: "circle", source: "points",
          layout: { visibility: "none" },
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["get", "count"], 1, 2.5, 20, 5, 100, 9, 400, 15],
            "circle-color": color("--caution"),
            "circle-opacity": .7,
            "circle-stroke-width": .6,
            "circle-stroke-color": color("--surface"),
          },
        });
      }
      map.addLayer({ id: "selected-dong", type: "line", source: "dongs", filter: ["==", ["get", "dong_code"], ""], paint: {
        "line-color": color("--caution"), "line-width": 3,
      } });
      for (const id of ["density-2d", "density-3d"]) {
        map.on("click", id, (event) => selectDong(event.features[0].properties.dong_code));
        map.on("mouseenter", id, () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", id, () => { map.getCanvas().style.cursor = ""; });
      }
      buildDongLabels();
      for (const f of data.districts.features) {
        const b = bounds([f]);
        const label = document.createElement("span"); label.className = "map-district-label"; label.textContent = f.properties.district;
        new maplibregl.Marker({ element: label }).setLngLat([(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2]).addTo(map);
      }
      ready = true;
      status.hidden = true;
      updateMap();
      updatePoints();
      setView(view);
    });
    new ResizeObserver(() => { if (map && host.clientWidth) map.resize(); }).observe(host);
    // A27: 무대가 바뀌어 다시 보일 때 캔버스 크기를 맞춘다. 숨어 있는 동안의
    // 크기 변화는 ResizeObserver가 0으로 보고 흘려보내기 때문이다.
    window.resizeDaejeonMap = () => {
      if (map && host.clientWidth) requestAnimationFrame(() => { map.resize(); updateDongLabels(); });
    };
  } catch (error) {
    status.hidden = false;
    status.textContent = "지도 데이터를 불러오지 못했습니다. 페이지를 새로고침하거나 아래 원본 지도를 이용해 주세요.";
  }
})();
