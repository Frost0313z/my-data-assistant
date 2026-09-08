# 컴포넌트 스펙 (Component Specs)

> **상위**: [문서 허브](../PORTFOLIO_SPEC.md) · **갱신**: 2026-09-08
> 성격: **구현 스펙.** 값은 [`design-system.md`](design-system.md)의 토큰을 쓴다.
> 범용 버튼·카드가 아니라 **이 도메인에서만 의미를 갖는 컴포넌트**만 정의한다.

---

## 이 도메인의 핵심 컴포넌트

우리 도메인은 **"AI가 설명해주는 상권 데이터"** 다. 이커머스의 상품카드에 해당하는 자리에 무엇이 오는가를 정하면 다음 6개다.

| # | 컴포넌트 | 왜 도메인 특화인가 | 관련 스펙 |
|---|---|---|---|
| 1 | **주제 선택기** Topic Selector | 데이터 축(8개 분석 주제)을 사용자 선택으로 바꾸는 진입점 | A2 · A9 · A10 |
| 2 | **대시보드 뷰포트** Dashboard Viewport | 외부 시각화(GitHub Pages)를 액자에 넣어 보여주는 장치. 우리 서비스의 물리적 중심 | A2 · A2a · A15 |
| 3 | **수치 헤드라인** Metric Headline | 증감을 **가치판단 없이** 전달하는 우리만의 규칙이 적용되는 곳 | A15 · A19 |
| 4 | **기준 배지** Data Basis Badge | "정직한 신뢰"를 화면에서 실행하는 단 하나의 컴포넌트 | A12 |
| 5 | **주제 인식 채팅** Topic-Aware Chat | 답변이 "어떤 주제 기준인지"를 계속 드러내는 대화 UI | A3b · A7 · A8 |
| 6 | **주제 리포트** Topic Report | 여정의 종착점. Primary Goal 그 자체 | A14 |

> 나머지(입력·버튼·표·히스토리)는 범용 컴포넌트라 [`design-system.md`](design-system.md)의 토큰만 따르면 된다.

---

## 1. 주제 선택기 (Topic Selector)

```
[Topic Selector]
├── Purpose: 8개 분석 주제 중 하나를 고르게 하고, 그 선택을 AI 컨텍스트로 넘긴다
├── Contents:
│   ├── 목적 칩 3개              "무엇이 궁금하세요?"        ← A9 (미구현)
│   ├── 기준 배지                 기준 시점 + 한계 고지        ← A12 (미구현)
│   └── 주제 버튼 8개             레이블만 (아이콘 없음)
├── Behavior:
│   ├── 라디오식 단일 선택 — 한 번에 하나
│   ├── 같은 버튼 재클릭 → 해제 (screenContext = null)
│   └── 선택 시 → 상세 렌더 + 컨텍스트 칩 + 대화에 구분선
├── States:
│   ├── Default   Surface 배경, Line 경계, ink-900 텍스트
│   ├── Hover     경계만 Primary로 (배경 변화 없음)
│   └── Active    Primary 배경, 흰 텍스트, weight 600
└── Responsive:
    ├── Desktop   4열 × 2행   (auto-fill, minmax(140px, 1fr))
    ├── Tablet    3열
    └── Mobile    2열
```

**접근성**: `role="group"` + `aria-label="분석 주제 선택"`, 각 버튼 `aria-pressed`. 선택 상태를 **색으로만** 전달하지 않도록 weight 600을 함께 쓴다.

**주의** — Active 상태가 Primary 배경을 쓰는 것은 [`design-system.md`](design-system.md) 규칙 1("Primary는 한 화면에 하나")의 **예외가 아니다.** 선택된 주제는 한 번에 하나뿐이므로 화면의 Primary도 하나다. 이 컴포넌트가 Primary를 쓰기 때문에 **주변 버튼("이 주제로 AI에게 질문" 등)은 중성으로 내려야 한다.**

---

## 2. 대시보드 뷰포트 (Dashboard Viewport)

```
[Dashboard Viewport]
├── Purpose: 외부 대시보드의 "해당 패널만" 액자에 넣어 보여준다
│            (시각화를 이중 관리하지 않기 위한 핵심 장치)
├── Contents:
│   ├── iframe    src = DASHBOARD_URL + "?" + topic.embed
│   └── 상태 오버레이 (absolute inset:0)
├── States:
│   ├── Loading   viewport-bg 위 viewport-muted 문구
│   │             "대시보드 패널을 불러오는 중..."
│   ├── Loaded    오버레이 hidden, iframe만
│   └── Error     15초 타임아웃 → viewport-error 문구 + [다시 시도]
├── Frame:
│   ├── height 760px · radius --r-panel · overflow hidden
│   ├── 배경 --viewport-bg (#0F1319)
│   └── 넘치면 페이지가 스크롤 (iframe 내부 스크롤 아님)
└── Responsive:
    ├── Desktop   중앙 칸 전체 폭
    └── Mobile    탭 전환으로 단독 표시
```

**다크인 이유** — 밝은 화면에 어두운 패널이 박히는 톤 분열은 [`emotional-design.md`](emotional-design.md) 진단 2에 있다. 분석 저장소를 고치는 것은 범위 밖이라, **다크를 "의도된 데이터 뷰포트"로 프레이밍**해 해결한다. 라운드·여백·(필요 시)라벨로 액자임을 분명히 한다.

**금지** — iframe 안쪽에 스크롤을 만들지 않는다. 커서가 iframe 위에 있으면 휠 이벤트를 뺏겨 **페이지 스크롤이 죽은 것처럼 보인다**(실제 발생했던 문제).

---

## 3. 수치 헤드라인 (Metric Headline)

```
[Metric Headline]
├── Purpose: 주제의 핵심 수치를 한 줄로. 화면의 주인공
├── Contents:
│   ├── 수치        Display 28px / 600 / tabular-nums
│   └── 증감        --trend-up (증가) / --trend-down (감소)
├── Example:
│   └── "77,904 → 80,704개 (+2,800, +3.59%)"
├── Rules:
│   ├── ❌ 증감에 초록/빨강 금지          ← 브랜드 약속 (A19)
│   ├── ❌ "좋다/나쁘다/호조/부진" 어휘 금지
│   ├── ✅ 방향만 표시, 가치판단 없음
│   └── ✅ 숫자는 tabular-nums로 자릿수 정렬
└── Responsive: 폭에 따라 줄바꿈 허용, 크기는 유지
```

**현재 상태**: 16.8px(`.topic-headline`)로 `h1`(17.6px)보다 작다. **화면의 주인공이 가장 작게 그려져 있다.** A15에서 28px로 올린다.

**증감 색 규칙의 근거** — 목동은 잔존율 최저(73.7%)인데 **+5.3% 늘었고**, 대흥동은 밀도 2위인데 **+0.4%로 멈췄다.** 초록/빨강은 이 뉘앙스를 지운다. 상세는 [`design-system.md`](design-system.md) 규칙 2.

---

## 4. 기준 배지 (Data Basis Badge)

```
[Data Basis Badge]                                        ← A12, 미구현
├── Purpose: 데이터의 범위와 한계를 스크롤 없이 상시 노출
│            "정직한 신뢰"를 화면에서 실행하는 컴포넌트
├── Position: 주제 버튼 바로 위 (현재는 중앙 칸 하단 회색 각주)
├── Contents:
│   ├── 기준       "2025-03 → 2026-06 · 대전 82개 행정동 · 등록 업소 수"
│   └── 한계       "매출·유동인구 미포함 · 참고용"
├── Style:
│   ├── 배경 --caution-bg (#FDF6E7)
│   ├── 텍스트 --caution (#8A5A00) · Caption 13px
│   └── radius --r-pill 또는 --r-panel
└── Responsive: 모바일에서 2줄 허용 (내용을 줄이지 않는다)
```

**회색이 아닌 이유** — 색이 곧 중요도 신호다.

| 색 | 읽히는 뜻 |
|---|---|
| 빨강 | 에러 / 위험 |
| **회색** | **안 읽어도 됨** ← 현재 상태 |
| **앰버** | **읽어라** ← 목표 |

우리의 최대 차별점(한계를 먼저 말하는 것)이 현재 화면에서 **가장 흐린 회색**으로 표현되고 있다. [`../research/user-journey.md`](../research/user-journey.md) Decision 단계 진단과 정면으로 어긋난다.

**금지** — 이 배지를 닫기·접기 가능하게 만들지 않는다. 상시 노출이 목적이다.

---

## 5. 주제 인식 채팅 (Topic-Aware Chat)

```
[Topic-Aware Chat]
├── Purpose: 답변이 "어떤 주제 기준인지"를 계속 드러내는 대화 UI
├── Contents (위→아래):
│   ├── 컨텍스트 칩      "선택한 주제: 점포 교체율"    --primary-tint
│   ├── 메시지 스트림
│   │   ├── user 버블         Primary 배경 / 흰 텍스트 / 우측 정렬
│   │   ├── assistant 버블    --warm-050 / --warm-300 경계 / 좌측  ← A17
│   │   ├── 토큰 각주         "토큰 1,730 (입력 1,688 · 출력 42)"
│   │   │                     Caption 13px · --ink-400 · tabular-nums
│   │   ├── 주제 구분선       "주제를 '점포 교체율'로 바꿨습니다"   ← A7
│   │   │                     중앙 정렬 · pill · --primary-tint
│   │   └── error 버블        --error-bg / --error-line + [다시 시도]
│   ├── 제안 질문 칩          주제별로 교체                      ← A10
│   └── 입력 행
├── States:
│   ├── Empty      AI 첫 인사말 (온보딩)                        ← A11
│   ├── Waiting    경과 시간에 따라 문구 단계 변화              ← A21
│   └── Error      3종 분기 (cold / ai / generic)               ← F3
└── Responsive:
    ├── Desktop   우측 400px 고정, sticky 100vh
    └── Mobile    하단 탭으로 전환, 버블 max-width 88%
```

**따뜻함이 여기에만 있는 이유** — 3분할 레이아웃에서 **좌·중앙은 데이터(쿨), 우측 채팅은 대화(웜)** 로 감성을 분업한다. 현재는 AI 버블이 무채색 `#eef0f3`이라 어시스턴트가 **시스템 메시지처럼** 보인다.

**토큰 각주는 버블 밖에 둔다** — 버블 안에 넣으면 AI가 한 말처럼 읽힌다. 형제 요소로 유지한다.

**주제 구분선은 같은 주제 연속 호출 시 중복 출력하지 않는다** (`lastNotifiedTopic` 가드). 대화 새로 시작·불러오기 시 초기화한다.

---

## 6. 주제 리포트 (Topic Report)

```
[Topic Report]                                            ← A14, 미구현
├── Purpose: 여정의 종착점. "가져갈 결과물"을 만든다
│            = Primary Goal (identity.md)
├── Trigger: 답변 아래 [이 주제 전체 리포트 보기]
├── Contents: AI가 고정 4블록 구조로 생성
│   ├── 요약        3줄 이내
│   ├── 핵심 수치    tabular-nums, 증감은 중립 2색
│   ├── 해석        "왜 그런가" — 단정하지 않는 어투
│   └── 한계        --caution 톤. 이 블록을 생략하지 않는다
├── States:
│   ├── Idle        버튼만
│   ├── Generating  A21 대기 상태 규칙 적용
│   └── Done        4블록 렌더
└── Responsive: 채팅 칸 폭 안에서 세로 스택
```

**4블록이 고정인 이유** — 구조가 흔들리면 "리포트"가 아니라 그냥 긴 답변이 된다. **`한계` 블록은 특히 생략 불가** — 이게 빠지면 골목상권과 차별점이 사라진다. 시스템 프롬프트에서 블록 구조를 강제한다.

**어투** — [`../identity.md`](../identity.md)의 `침착한 · 솔직한 · 정확한`. "유망하다", "추천한다" 같은 단정 어휘를 쓰지 않는다.

---

## 컴포넌트 → 스펙 대응

| 컴포넌트 | 구현 상태 | 남은 작업 |
|---|---|---|
| 주제 선택기 | ✅ 기본 동작 | A9(목적 칩) · A10(제안 질문) · A12(배지) |
| 대시보드 뷰포트 | ✅ 완료 | A15(액자 다듬기) |
| 수치 헤드라인 | ⚠️ 크기·색 미적용 | A15(28px) · A19(중립 색) |
| 기준 배지 | ⬜ 미구현 | **A12** |
| 주제 인식 채팅 | ✅ 대부분 | A17(온기) · A10(칩) · A11(인사말) · A21(대기) |
| 주제 리포트 | ⬜ 미구현 | **A14** |
