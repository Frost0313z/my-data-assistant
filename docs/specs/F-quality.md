# F. 품질 · 접근성

> **상위**: [스펙 인덱스](README.md) · [문서 허브](../PORTFOLIO_SPEC.md) · **갱신**: 2026-09-08
> 범례: **P0/P1/P2** 우선순위 · **S** ≤0.5일 / **M** 1~2일 / **L** 3일+

**참조**: 색 대비·모션 규칙은 [`../design/design-system.md`](../design/design-system.md).

---

| ID | 항목 | P | 공수 | 내용 | 수용 기준 |
|---|---|---|---|---|---|
| **F1** | 접근성 | P1 | M | 키보드 내비게이션, ARIA 라벨, **색 대비 AA**, 채팅 새 메시지 시 포커스·`aria-live` | 키보드만으로 전체 조작, Lighthouse 접근성 90+ |
| **F2** | 성능 | P1 | S | iframe 지연 로드, 정적 자산 캐시 헤더, 폰트 폴백. Lighthouse 측정 | Lighthouse 성능 90+, 대시보드 늦게 로드해도 채팅은 즉시 상호작용 |
| **F3** | 전역 에러 상태 UI 3종 | P0 | S | (1) 백엔드 콜드스타트/무응답 (2) OpenAI 실패 (3) 대시보드 로드 실패 — 각각 사용자 문구와 재시도 | 세 상황을 강제로 만들면 앱이 깨지지 않고 안내가 뜬다 |

---

## 작업 시 주의

### A15(디자인 토큰)와의 순서

**F1의 색 대비 검증은 A15 이후에 한다.** 팔레트가 바뀌는데 먼저 검증하면 두 번 일한다. A15가 도입하는 값 중 대비를 특히 확인할 것:

- `--ink-500 #6B7280` on `--canvas #F6F7F9` — 보조 텍스트
- `--ink-400 #8B93A1` on `--surface` — 토큰 사용량(Caption 13px)
- `--caution #8A5A00` on `--caution-bg #FDF6E7` — 한계 고지
- `--viewport-muted #93A2B3` on `--viewport-bg #0F1319` — 임베드 로딩 문구

### `[hidden]` 처리

전역 리셋 `[hidden] { display: none !important; }`가 [`../../frontend/css/style.css`](../../frontend/css/style.css) 상단에 있다. **지우지 말 것.** 독립 HTML에는 이 UA 스타일 보정이 없어 작성자의 `display` 규칙이 `hidden` 속성을 덮어버린다(탭바·로딩 상태가 안 숨겨지는 문제가 실제로 있었다).

### 페이지 스크롤

`.layout`은 `min-height:100vh` + `align-items:start`, 좌·우 패인은 `position:sticky`다. **`height:100vh; overflow:hidden`으로 되돌리지 말 것** — 문서 스크롤이 잠기고, 커서가 iframe 위에 있으면 휠이 먹혀 스크롤이 죽은 것처럼 보인다.

### F3 콜드스타트 문구 → A21로 이관

현재 "콜드스타트" 안내는 **fetch 실패 시에만** 뜨고, 문구가 "다시 시도해 주세요"다. 그런데 실제 콜드스타트는 요청이 붙잡힌 채 ~43초 후 **자동으로 성공**하므로, 재시도를 권하는 것은 **오안내**다. 그 사이 아무 피드백이 없는 것도 문제다.

대기 상태 설계는 **A21**로 분리했다. → [`../design/motion.md`](../design/motion.md) 인터랙션 4

F3의 책임은 **진짜 실패했을 때의 3종 분기**로 유지한다.

### 모션 접근성

`prefers-reduced-motion` 대응은 A18 범위지만 F1 수용 기준에도 걸린다. **대기 상태의 경과 초 표시는 이 규칙으로 줄이지 않는다** — 애니메이션이 아니라 정보다. → [`../design/motion.md`](../design/motion.md)

---

## 실측 (2026-09-09)

크롬 Lighthouse(desktop, navigation)와 성능 트레이스로 쟀다. **로컬 정적 서버 기준**이라
배포본 수치는 다를 수 있다 — 네트워크 지연과 캐시 헤더가 여기서는 빠져 있다.

| 항목 | 결과 | 목표 |
|---|---|---|
| 접근성 | **100** | 90+ |
| Best Practices | **100** | — |
| SEO | **100** | — |
| Agentic Browsing | **100** | — |
| LCP | **713ms** (TTFB 5ms + 렌더 708ms) | 2.5s 이하 |
| CLS | **0.00** | 0.1 이하 |
| 색 대비 AA 위반 | **0건** (보이는 텍스트 전수 계산) | 0 |

### F1에서 고친 것

| | 왜 |
|---|---|
| 스킵 링크 | 포커스 대상이 29개다. 키보드 사용자는 **지도 툴바(셀렉트 5 + 버튼 4)를 전부 지나야** 채팅에 닿았다 |
| `#chat-input`에 `aria-label` | placeholder는 접근 가능한 이름이 아니다 |
| `#chat-messages`에 `aria-live="polite"` | 새 답변이 안 읽혔다 |
| 스트리밍 중 `aria-busy="true"` | 없으면 **토큰이 올 때마다** 읽어 소음이 된다. 다 받고 풀 때 한 번에 읽힌다 |
| 대기 버블에도 `aria-busy` | 경과 초가 1초마다 바뀐다 — 그대로 두면 매초 읽는다 |
| 오류 버블에 `role="alert"` | 오류는 기다릴 것이 없다 |
| 표에 `<caption>` | 무엇을 담은 표인지 |

### F2에서 한 것

- **캐시 헤더**(`vercel.json`) — HTML·JS·CSS는 `max-age=0, must-revalidate`. 파일 이름에 해시가 없어 오래 캐시하면 배포해도 옛 화면이 남는다. **이번 작업 중에도 브라우저가 옛 JS를 잡고 있어 여러 번 헤맸다.** 지도 데이터(392KB + 54KB)만 1시간 + `stale-while-revalidate`.
- **iframe 지연 로드** — 이미 돼 있었다. `loading="lazy"`인 데다 A27 이후로는 **탭을 눌러야 만들어진다.**
- **폰트** — Pretendard CDN이 이미 `font-display: swap`이라 글자가 안 보이는 구간이 없다. `font-family` 폴백도 있다.

남은 것: **배포본에서 다시 재기.** 위 수치는 전부 로컬이다.
