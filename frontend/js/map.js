// 기존 대시보드의 대전 경계와 지표를 재사용한다. 높이는 건물이 아닌 공급 밀도다.
(async function () {
  const $ = (id) => document.getElementById(id);
  const period = $("map-period"), district = $("map-district"), dong = $("map-dong");
  const status = $("map-status"), host = $("daejeon-map");
  const viewButtons = [...document.querySelectorAll("[data-map-view]")];
  const css = getComputedStyle(document.documentElement);
  const color = (name) => css.getPropertyValue(name).trim();
  const colors = [1, 2, 3, 4, 5].map((n) => color(`--map-level-${n}`));
  const breaks = [40, 60, 100, 200];
  const colorFor = (v) => colors[breaks.filter((b) => v >= b).length];
  let map, data, selected = "", view = "3d", ready = false, fallback = false;

  function coordinates(geometry) {
    return geometry.coordinates.flat(geometry.type === "MultiPolygon" ? 2 : 1);
  }
  function bounds(features) {
    const points = features.flatMap((f) => coordinates(f.geometry));
    return [[Math.min(...points.map((p) => p[0])), Math.min(...points.map((p) => p[1]))],
      [Math.max(...points.map((p) => p[0])), Math.max(...points.map((p) => p[1]))]];
  }
  function rows() { return data.metrics[period.value]; }
  function features() {
    const values = new Map(rows().map((r) => [r.dong_code, r.density]));
    return data.boundaries.features.map((f) => ({ ...f, properties: { ...f.properties, density: values.get(f.properties.dong_code) } }));
  }
  function visibleFeatures() {
    return data.boundaries.features.filter((f) => !district.value || f.properties.district === district.value);
  }
  function syncContext() {
    const row = rows().find((r) => r.dong_code === selected);
    const label = `공급 밀도 · ${period.value.slice(0, 7)}${row ? ` · ${row.district} ${row.dong}` : " · 대전 전체"}`;
    if (window.focusMapAnalysis) window.focusMapAnalysis(label);
  }
  function showSelection() {
    const row = rows().find((r) => r.dong_code === selected);
    $("map-selection-name").textContent = row ? `${row.district} ${row.dong}` : "어느 동이 궁금하세요?";
    $("map-selection-value").textContent = row
      ? `${period.value.slice(0, 7)} · 인구 1,000명당 등록 업소 ${row.density.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}개`
      : "지도나 행정동 목록에서 지역을 선택해 주세요.";
    $("map-ask").disabled = !row;
    dong.value = selected;
    if (ready) map.setFilter("selected-dong", ["==", ["get", "dong_code"], selected]);
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
  function updateMap() {
    if (ready) {
      map.getSource("dongs").setData({ type: "FeatureCollection", features: features() });
      const filter = district.value ? ["==", ["get", "district"], district.value] : null;
      ["density-2d", "density-3d", "dong-lines"].forEach((id) => map.setFilter(id, filter));
    }
    if (fallback) renderFallback();
    showSelection();
  }
  function setView(mode) {
    view = mode;
    viewButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mapView === mode)));
    $("map-view-note").textContent = mode === "3d"
      ? "3D 높이는 공급 밀도를 표현합니다. 실제 건물 높이가 아닙니다."
      : "2D 색은 공급 밀도를 표현합니다. 3D와 같은 데이터·구간을 사용합니다.";
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
    svg.setAttribute("aria-label", "대전 공급 밀도 2D 지도. 위 행정동 목록으로도 선택할 수 있습니다.");
    for (const f of features().filter((f) => !district.value || f.properties.district === district.value)) {
      const polygons = f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [f.geometry.coordinates];
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", polygons.flatMap((polygon) => polygon.map((ring) => ring.map((p, i) =>
        `${i ? "L" : "M"}${(p[0] - box[0][0]) * ratio},${box[1][1] - p[1]}`).join(" ") + "Z")).join(" "));
      path.setAttribute("fill", colorFor(f.properties.density));
      path.setAttribute("fill-rule", "evenodd");
      path.setAttribute("stroke", f.properties.dong_code === selected ? color("--caution") : color("--surface"));
      path.setAttribute("stroke-width", f.properties.dong_code === selected ? ".0015" : ".0004");
      const title = document.createElementNS(ns, "title");
      title.textContent = `${f.properties.district} ${f.properties.dong} · ${f.properties.density}개/1,000명`;
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
    const response = await fetch("data/daejeon-map.json");
    if (!response.ok) throw new Error("지도 데이터 응답 실패");
    data = await response.json();
    data.periods.forEach((p) => period.add(new Option(p.slice(0, 7), p)));
    period.value = data.periods.at(-1);
    [...new Set(rows().map((r) => r.district))].sort().forEach((d) => district.add(new Option(d, d)));
    updateDongOptions();
    [period, district, dong, $("map-reset"), ...viewButtons].forEach((e) => { e.disabled = false; });
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
      const fill = ["step", ["get", "density"], colors[0], 40, colors[1], 60, colors[2], 100, colors[3], 200, colors[4]];
      map.addSource("dongs", { type: "geojson", data: { type: "FeatureCollection", features: features() } });
      map.addSource("districts", { type: "geojson", data: data.districts });
      map.addLayer({ id: "density-2d", type: "fill", source: "dongs", layout: { visibility: "none" }, paint: { "fill-color": fill } });
      map.addLayer({ id: "density-3d", type: "fill-extrusion", source: "dongs", paint: {
        "fill-extrusion-color": fill, "fill-extrusion-height": ["*", ["get", "density"], 6], "fill-extrusion-opacity": .96,
      } });
      map.addLayer({ id: "dong-lines", type: "line", source: "dongs", paint: { "line-color": color("--surface"), "line-width": .7 } });
      map.addLayer({ id: "district-lines", type: "line", source: "districts", paint: { "line-color": color("--primary"), "line-width": 1.2 } });
      map.addLayer({ id: "selected-dong", type: "line", source: "dongs", filter: ["==", ["get", "dong_code"], ""], paint: {
        "line-color": color("--caution"), "line-width": 3,
      } });
      for (const id of ["density-2d", "density-3d"]) {
        map.on("click", id, (event) => selectDong(event.features[0].properties.dong_code));
        map.on("mouseenter", id, () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", id, () => { map.getCanvas().style.cursor = ""; });
      }
      for (const f of data.districts.features) {
        const b = bounds([f]);
        const label = document.createElement("span"); label.className = "map-district-label"; label.textContent = f.properties.district;
        new maplibregl.Marker({ element: label }).setLngLat([(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2]).addTo(map);
      }
      ready = true;
      status.hidden = true;
      updateMap();
      setView(view);
    });
    new ResizeObserver(() => { if (map && host.clientWidth) map.resize(); }).observe(host);
  } catch (error) {
    status.hidden = false;
    status.textContent = "지도 데이터를 불러오지 못했습니다. 페이지를 새로고침하거나 아래 원본 지도를 이용해 주세요.";
  }
})();
