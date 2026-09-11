// A32: 그리기 전에 테마를 정한다. 바디 끝에서 하면 라이트로 한 번 그려졌다가
// 어두워지는 깜빡임이 보인다. <head>에서 defer 없이 부르므로 렌더 전에 실행된다.
//
// 저장된 선택이 있으면 그걸 쓰고, 없으면 OS 설정을 따른다. 즉 버튼을 한 번도
// 안 누른 사람에게는 예전(자동)과 똑같이 동작한다.
//
// 인라인이었다가 파일로 뺐다(2026-09-11). CSP를 켜면서 인라인 스크립트를 허용하려면
// 해시를 박아야 하는데, 줄바꿈 하나만 바뀌어도 해시가 어긋나 **테마가 조용히 깨진다.**
// 요청 하나를 더 쓰는 대신 그 결합을 없앤다 — 같은 오리진이라 'self'로 덮인다.
(function () {
  var dark = false;
  try {
    var saved = localStorage.getItem("theme_v1");
    dark = saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch (e) { /* 사생활 보호 모드 */ }
  document.documentElement.dataset.theme = dark ? "dark" : "light";
})();
