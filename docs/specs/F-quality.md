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

### F3 콜드스타트 문구

현재 "콜드스타트" 안내는 **fetch 실패 시에만** 뜬다. 실제 콜드스타트는 요청이 붙잡힌 채 ~43초 후 성공하므로 그 사이엔 아무 피드백이 없다. 개선안(경과 초 표시 + 단계적 문구)은 **미구현 상태**다.
