# 디자인 시스템 (Design System)

> **상위**: [문서 허브](../PORTFOLIO_SPEC.md) · **갱신**: 2026-09-08
> 성격: **구현 스펙.** A15·A16·A17·A18·A19를 맡은 에이전트가 이 문서만 보고 작업할 수 있어야 한다.
> "왜 이 값인가"는 [`emotional-design.md`](emotional-design.md).

---

## 1. Color System

### 역할별 팔레트

```
Primary        #1E478F  Trust Navy    핵심 액션 · 선택 상태 · 링크
Primary Hover  #2F5FA8
Primary Tint   #EEF3FB                선택 배경 · 컨텍스트 칩
Accent (Warm)  #FBF7F1  Warm Ivory    AI 버블 배경 ※ 채팅 칸 전용
Accent Line    #E6D9C6                AI 버블 경계
Canvas         #F6F7F9  Cool Gray     페이지 배경
Surface        #FFFFFF                패널 · 카드
Line           #E3E6EA                경계
Text Primary   #16191D  Ink 900       제목 · 핵심 수치
Text Body      #3B4252  Ink 700       본문
Text Muted     #6B7280  Ink 500       보조 · 메타
Caution        #8A5A00 / #FDF6E7      한계 고지 ※ 위험 아님, "읽어야 할 것"
Error          #B3261E / #FDECEA      요청 실패 · 삭제
Success        #1B7A4B                시스템 상태 전용 (저장 완료 등)
Viewport BG    #0F1319                임베드 대시보드 액자 (다크 유지)
```

### 규칙 1 — Primary는 한 화면에 하나

현재 `#2563eb`가 버튼·선택·링크·유저 발화·활성 탭 **5가지를 겸하고 있다.** 파란색이 흔해지면 강조력을 잃는다.

- Primary를 쓰는 것: **선택 상태 · 링크 · 그 화면의 주 액션 하나**
- 보조 버튼은 `Surface + Line` 중성으로 내린다

### 규칙 2 — 증감에 초록/빨강을 쓰지 않는다

```
Trend Up    #2F5FA8  (Cool)      증가
Trend Down  #B06A2C  (Warm)      감소
```

데이터 대시보드의 관습은 `증가=초록(좋음) / 감소=빨강(나쁨)`이다. **우리는 그 판단을 할 수 없다.** 점포가 늘어난 게 좋은 일인지 우리 데이터로는 모른다(매출 없음). 실제 반례가 있다.

> **목동**은 잔존율 최저(73.7%)인데 **+5.3% 늘었고**, **대흥동**은 밀도 2위인데 **+0.4%로 멈췄다.**

초록/빨강은 이 뉘앙스를 지워버린다. 그래서 **방향만 표시하고 가치는 매기지 않는 중립 2색**을 쓴다. 문구에서도 증감 옆에 "좋다/나쁘다" 어휘를 쓰지 않는다.

**이건 장식이 아니라 브랜드 약속의 시각적 구현이다.** (→ A19)

> **범위 주의**: 분석 저장소 대시보드는 별도 팔레트다. 임베드 패널까지 통일하려면 분석 저장소 수정이 필요하므로 **범위 밖**. 다크 패널은 "데이터 뷰포트"로 액자화한다.

---

## 2. Typography

### 현재 상태 진단

`font-size` 값이 **11종**인데 전부 `0.72rem ~ 1.1rem`(11.5~17.6px) 안에 몰려 있다. **6px 범위에 11단계라 위계가 사실상 없다.**

- `h1`(17.6px)과 `h2`(15.2px)의 차이가 **2.4px**
- 화면의 주인공인 `.topic-headline`(`77,904 → 80,704개`, 16.8px)이 **`h1`보다 작다**

수치가 핵심인 서비스인데 수치가 가장 작게 그려져 있다.

### 목표 스케일

```
Headings / Body   Pretendard  (400 / 500 / 600)   ※ 700 남용 금지 — 차분함
Numerals          동일 서체 + font-variant-numeric: tabular-nums (전역)

Scale (1.25 ratio)
  Display   28px / 600   핵심 수치 헤드라인      ← 현재 16.8px
  H1        22px / 600   서비스 제목             ← 현재 17.6px
  H2        18px / 600   패널 제목               ← 현재 15.2px
  H3        16px / 500   소제목
  Body      15px / 400   본문 · 버블
  Caption   13px / 400   메타 · 토큰 · 각주
```

**세리프는 쓰지 않는다.** 감성 매트릭스의 `신뢰 = 안정적인 세리프/산세리프` 중 산세리프를 택한 이유는, 한국어 세리프(본명조 계열)가 소자 가독성이 떨어지고 무게감이 `차분함`을 넘어 `권위`로 가기 때문이다. **권위는 골목상권의 축이지 우리 축이 아니다.**

> **결함**: 현재 `font-family`에 `Pretendard`가 선언돼 있으나 `@font-face`도 CDN 링크도 없어 **맑은 고딕으로 폴백된다.** A16에서 실제 로드한다.

---

## 3. Spacing · Radius · Shadow

```
Base unit    4px      스텝: 4 · 8 · 12 · 16 · 24 · 32
```

8px 배수만 쓰면 조밀한 3분할 UI에서 6·10·14px을 표현할 수 없어 **4px 기반**으로 잡는다. 현재 CSS는 `4/6/7/8/10/12/14/18/24px`이 규칙 없이 섞여 있다.

```
Radius
  버튼 · 입력      8px
  데이터 패널      10px    정돈 (신뢰)
  채팅 버블        16px    부드러움 (따뜻함)   ← 현재 12px
  칩 · 배지        999px
```

라운드로도 **감성 분업**(데이터=쿨 / 채팅=웜)을 표현한다.

```
Shadow
  평면 요소   그림자 없음 — 1px Line으로만 구분
  떠 있는 것  모달 · 드롭다운에만  0 4px 16px rgba(22,25,29,.10)
```

현재 화면은 `box-shadow`가 사실상 없고 전부 보더로 구분한다. **이건 이미 `차분함`에 맞으므로 유지하고 원칙으로 명문화한다.** 그림자를 더하는 방향이 아니라, **더하지 않기로 결정한다.**

```
Motion
  주제 전환   150ms ease  fade
  그 외       없음
  prefers-reduced-motion: reduce  →  전부 제거
```

---

## 4. 구현 참고 — 토큰 정의

```css
:root {
  /* 잉크 */
  --ink-900:#16191D; --ink-700:#3B4252; --ink-500:#6B7280; --ink-400:#8B93A1;
  --canvas:#F6F7F9;  --surface:#FFFFFF; --surface-sunken:#EFF1F4;
  --line:#E3E6EA;    --line-strong:#D3D7DD;

  /* 신뢰 — "선택됨"과 "링크"에만 */
  --primary:#1E478F; --primary-hover:#2F5FA8;
  --primary-tint:#EEF3FB; --primary-tint-line:#D8E4F5;

  /* 따뜻함 — 채팅 칸 전용 */
  --warm-050:#FBF7F1; --warm-300:#E6D9C6;

  /* 의미 */
  --caution:#8A5A00; --caution-bg:#FDF6E7;
  --error:#B3261E;   --error-bg:#FDECEA;  --error-line:#F0C8C3;
  --success:#1B7A4B;
  --trend-up:#2F5FA8; --trend-down:#B06A2C;

  /* 임베드 액자 (다크 유지) */
  --viewport-bg:#0F1319; --viewport-muted:#93A2B3;
  --viewport-link:#4C8DFF; --viewport-error:#F0625F;

  /* 타이포 */
  --fs-display:28px; --fs-h1:22px; --fs-h2:18px;
  --fs-h3:16px; --fs-body:15px; --fs-caption:13px;

  /* 간격 */
  --sp-1:4px; --sp-2:8px; --sp-3:12px; --sp-4:16px; --sp-6:24px; --sp-8:32px;

  /* 라운드 */
  --r-control:8px; --r-panel:10px; --r-bubble:16px; --r-pill:999px;

  /* 그림자 */
  --shadow-float:0 4px 16px rgba(22,25,29,.10);
}
```

### 치환 대응표 (A15 작업용)

| 현재 하드코딩 | 쓰인 곳 | → 토큰 |
|---|---|---|
| `#f5f6f8` | `body` 배경, `.topic-note` 배경 | `--canvas` |
| `#1f2328` | 본문 텍스트 | `--ink-900` |
| `#3b4252` | `.topic-desc`, `.topic-note` | `--ink-700` |
| `#6b7280` | `.topic-empty`, `.topics-foot`, 탭바 | `--ink-500` |
| `#8b93a1` | `.usage` | `--ink-400` |
| **`#2563eb`** | **버튼·선택·링크·유저버블·활성탭 (5중)** | **역할별 분해 — 규칙 1** |
| `#1d4ed8` | `.screen-context b` | `--primary` |
| `#e2e4e8` | 패널·패인 경계 | `--line` |
| `#d0d3d9` `#cdd6e4` | 입력·고스트 버튼 경계 | `--line-strong` |
| `#eef0f3` | **AI 버블** / 제안 칩 · 표 버튼 | **버블은 `--warm-050`** (A17) / 나머지 `--surface-sunken` |
| `#eef4ff` `#d5e3ff` | 컨텍스트 칩, 주제 구분선 | `--primary-tint` / `--primary-tint-line` |
| `#c62828` `#b71c1c` `#fdecea` `#f5c6c0` | 삭제·에러 | `--error` / `--error-bg` / `--error-line` |
| `#0f1319` `#93a2b3` `#4c8dff` `#f0625f` | 임베드 액자 | `--viewport-*` |

**수용 기준**: 치환 후 `style.css`에 색상 리터럴이 `:root` 밖에 남지 않는다.

---

## 5. 관련 스펙

| ID | 항목 | 이 문서에서 볼 곳 |
|---|---|---|
| **A15** | 디자인 시스템 토큰 | 1·2·3·4 전부 |
| **A16** | 웹폰트 로드 + 수치 타이포 | 2 |
| **A17** | 채팅 영역 온기 분리 | 1(Accent), 3(Radius) |
| **A18** | 모션 최소 원칙 | 3(Motion) |
| **A19** | 증감 표현 중립 색 | 1 규칙 2 |
| **A12** | 기준 배지 + 한계 고지 | 1(Caution) |
| **F1** | 접근성 색 대비 AA | 1 — 대비 검증 필요 |
