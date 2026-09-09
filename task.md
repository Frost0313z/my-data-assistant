# 남은 작업

> **갱신** 2026-09-09 · **브랜치** `feat/portfolio-phase1b` (로컬, `main` 대비 43커밋 앞섬)
>
> 이 파일은 **무엇을 할지**만 적는다. **진행 상태는 [`docs/roadmap.md`](docs/roadmap.md) §3에서만 관리한다** — 두 곳에 상태를 적으면 갈라진다. 완료 항목은 여기서 지우고 roadmap에 기록한다.

---

## 0. 지금 막힌 것 — 브랜치

- [x] **`main`에 `--no-ff` 머지 + 푸시** — `db4d7b5`, origin 반영

Phase 1-b(사용자 여정) · Phase 1-c(지도 중심 진입) 전체와 오늘 고친 결함 6건이 **로컬 한 브랜치에만** 있다. 검증은 끝났는데 머지가 안 돼 이 작업 전부가 디스크 하나에 존재한다.

```bash
git checkout main && git merge --no-ff feat/portfolio-phase1b && git push
```

- [ ] Render `Branch` 설정이 `feat/portfolio-phase1`로 남아 있으면 `main`으로 원복
- [ ] 배포 후 `openapi.json` 스키마로 실제 배포본 확인 (브랜치 설정이 안 먹은 전례 있음)
- [x] R2 워크트리(`Frost0313z/R2`) 최신화 — `db4d7b5`로 fast-forward — 안 하면 코덱스가 `665751f` 시점의 낡은 브리핑을 읽는다

---

## 1. Phase 2 — 실무 완성도 (7건)

**순서**: `C1 → C2` 먼저. 테스트와 CI가 있어야 나머지를 안심하고 건드린다.

- [x] **C1 · pytest 통합 테스트** (M, P0) — `backend/tests/` 59개 통과. `append_turn` 트랜잭션 + 회귀 테스트 포함
  `test_models.py` 단일 assert 파일 → pytest. 라우터별 `TestClient` 통합 테스트, **Firestore·OpenAI는 반드시 페이크/모킹**(실제 호출 금지 — 비용 + 쓰레기 데이터).
  **여기에 물려 있는 것**: `conversation_service.append_turn`의 read-modify-write 경합. 프론트 전송 잠금은 현실적인 트리거를 없앴을 뿐 **탭 두 개면 여전히 재현**된다. Firestore 트랜잭션으로 바꾸고 회귀 테스트를 같이 남긴다.

- [ ] **C2 · GitHub Actions CI** (S, P0)
  푸시·PR마다 `pytest` + 프론트 `node build.js` 스모크. 통과 시에만 배포.

- [ ] **C5 · 요약 결과 캐시** (S, P1)
  `/api/data/summary`를 매 채팅마다 Firestore 492건 전량 읽어 재계산 중. 짧은 TTL(30초) 인메모리 캐시 + 데이터 변경 시 무효화. 코드 리뷰에서도 지적된 항목.

- [ ] **C4 · 구조적 로깅 + 요청 ID** (S, P1)
  요청마다 UUID, JSON 로그. `/api/chat`은 모델·프롬프트 토큰·완료 토큰·추정 비용 기록.
  **곁들일 것**: 프롬프트 캐시 적중(`prompt_tokens_details.cached_tokens`)을 함께 남기면 캐시 프리픽스가 깨졌을 때 알 수 있다. 지금은 응답이 멀쩡해서 비용만 조용히 오른다.

- [ ] **C6 · 콜드스타트 핑** (S, P1)
  외부 크론(cron-job.org 등)으로 10분마다 `GET /`. **쓰기 요청을 폴링하면 안 된다** — 과거 Firestore에 쓰레기 레코드가 쌓인 전례.

- [ ] **D3 · 시드 리셋 엔드포인트** (S, P1)
  `POST /api/dev/reset` (토큰 보호). 리뷰어가 데모 데이터를 망가뜨려도 복구. 기준 상태는 **conversations 0 / data 492**.

- [ ] **A4 · 채팅 스트리밍 + 마크다운 렌더** (M, P1)
  OpenAI SSE → 토큰 단위 출력. 마크다운(표·목록·굵게) 렌더, **화이트리스트 방식으로 XSS 차단 유지**.
  **여기서 해소되는 것**: 답변에 `### 종합 해석`이 서식 없이 그대로 노출되는 문제(`A4a`). 렌더가 들어간 뒤 남는 품질 문제(문단 길이·수치 인용 밀도·반복)는 그때 다시 본다.

---

## 2. 코드 리뷰에서 보류한 2건

판정과 근거는 [`docs/roadmap.md`](docs/roadmap.md) §코드 리뷰.

- [ ] **CORS 기본값이 `*`** — `ALLOWED_ORIGINS` 기본값이 열려 있다. 배포는 env로 좁히지만 기본값이 와일드카드다. **기본값을 좁히면 env가 빠진 배포가 조용히 죽으므로** `C3`과 함께 판단한다.
- [ ] **`map.on("error")` 경로에 2D 폴백 없음** — 생성자 예외와 `webglcontextlost`에는 이미 `useFallback()`이 붙어 있다. 이 지도는 외부 소스가 없어 `error`가 대개 일시적이라, 아무 오류에나 SVG로 내려가는 게 더 나쁠 수 있다.

---

## 3. Phase 3 — 심화 (11건)

**순서**: `B2 → C5 → D3`. 전량 적재가 캐시와 리셋의 성격을 바꾼다.

| ID | 크기 | 내용 |
|---|---|---|
| **B2** | **L+** | 실데이터 Firestore **전량** 적재 — 82 행정동 × 6 시점 × 업종. 스키마에 `district`/`dong`/`industry` 추가 |
| **B3** | M | 요약 API 필터 — `?district=&dong=&industry=&from=&to=`. B2 이후 필수 |
| **B1** | M | `insights.md` 자동 생성 스크립트 (`scripts/build_insights.py`). 지금은 수기 큐레이션 |
| **C3** | M | 채팅 rate limit + 일일 토큰 상한 → 429 |
| **C7** | S | Sentry 무료 티어 (백엔드·프론트) |
| **F1** | M | 접근성 — 키보드 내비, ARIA, **색 대비 AA**, Lighthouse 90+. **A15가 끝나 지금 할 수 있다** |
| **F2** | S | 성능 — iframe 지연 로드, 캐시 헤더, Lighthouse 90+ |
| **E2** | S | ADR 3~5건 (바닐라 JS · Firestore · 컨텍스트 주입 · 임베드 · 키 관리) |
| **E3** | M | 데모 시나리오 + GIF/영상, README 상단 |
| **E4** | S | 회고 — 배운 점, 트레이드오프, 다음 단계 |
| B4·B5 | S·L | (선택) 트렌드 판정 고도화 · `insights` RAG |

---

## 4. 미승인 제안 2건

착수 전 결정이 필요하다.

- [ ] **탭 이름 충돌** — 하단 탭 `점포 교체율`이 지도 지표 `점포 교체율`과 같은 이름인데 다른 것을 보여준다(탭=산점도, 지도=코로플레스). 탭을 `교체율 산점도`로 바꿀지.
- [ ] **지도에 증감률 지표 추가** — 지도에는 "변화" 축이 아예 없는데 하단 탭 5개 중 4개가 그것을 쓴다. `stores`로 계산 가능(-1.5% ~ +82.2%, 중앙 +3.4%). 지도가 `--trend-up`/`--trend-down`을 쓰는 첫 사례가 된다.

---

## 작업 시 지켜야 하는 것

- `.env` · `firebase-service-account.json` — **커밋 금지, 값을 문서·로그·대화에 노출 금지**
- **워밍업·상태 확인에 쓰기 요청을 폴링하지 않는다** (Firestore 쓰레기 레코드 전례)
- 테스트는 Firestore·OpenAI를 모킹한다 — **실제 외부 호출 금지**
- 화면에 나가는 모든 문구는 한국어
- 검증 전에는 roadmap에서 완료로 올리지 않는다
- 수동 점검 뒤 기준 상태 복구: **conversations 0 / data 492**
