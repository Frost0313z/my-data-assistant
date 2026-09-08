# 포트폴리오 확장 스펙 — 문서 허브

**프로젝트**: 나만의 AI 비서 — 대전 상권 분석 에이전트
**문서 버전**: 1.0 (분할판)
**최종 갱신**: 2026-09-08
**상태**: Phase 1 완료 · main 머지·배포·라이브 검증 통과 · 다음은 **Phase 1-b**

> **v0.8까지 단일 문서였던 SPEC을 주제별로 분할했다.** 이 파일은 이제 내용을 담지 않고 **입구** 역할만 한다. 실제 내용은 아래 문서들에 있다.
> 분할 사유: 에이전트 팀 작업 시 **한 에이전트가 자기 작업에 필요한 문서만 읽게** 하기 위함. 단일 파일(525줄)은 매번 전체를 읽어야 했다.

---

## 문서 지도

| 문서 | 담는 것 | 성격 |
|---|---|---|
| [`context.md`](context.md) | 배경·서사 전환 · v1.0 기준선 · 목표(G1~G4) · 비범위 | **먼저 읽을 것** |
| [`identity.md`](identity.md) | 서비스명·한 줄 소개·포지셔닝·목표 액션·브랜드 성격 | 기준 |
| [`research/benchmark-golmok.md`](research/benchmark-golmok.md) | 서울시 골목상권 벤치마킹 — 가져올 것/안 가져올 것 | 레퍼런스 |
| [`research/user-journey.md`](research/user-journey.md) | Entry→Retention 6단계 여정 진단 · 성숙도 표 | 레퍼런스 |
| [`design/emotional-design.md`](design/emotional-design.md) | 목표 감정("정직한 신뢰") · 감성 키워드 · 현재 화면 진단 6건 | 판단 근거 |
| [`design/design-system.md`](design/design-system.md) | **구현용** 팔레트·타입 스케일·간격·라운드·그림자 | **구현 스펙** |
| [`design/components.md`](design/components.md) | 도메인 핵심 컴포넌트 6종 (구성·상태·반응형) | **구현 스펙** |
| [`design/motion.md`](design/motion.md) | 모션 스케일 3단 · 인터랙션 8종 · 대기 상태 | **구현 스펙** |
| [`specs/`](specs/README.md) | A~F 스펙 항목 전체 (ID·우선순위·공수·수용 기준) | **작업 단위** |
| [`roadmap.md`](roadmap.md) | Phase 1 / 1-b / 2 / 3 계획 · 리스크 · 진행 현황 | 계획 |
| [`decisions.md`](decisions.md) | 확정된 결정 5건 + 미결 1건 | **재논의 금지 목록** |
| [`roles/`](roles/README.md) | 역할 6종 + 조율자 · 파일 소유권 · 충돌 지점 · 병렬 계획. **역할별 브리핑 7종** | **팀 구성 시** |
| [`CHANGELOG.md`](CHANGELOG.md) | 문서 변경 이력 (v0.1~v1.0) | 이력 |

**저장소 안**: [`../README.md`](../README.md) · [`../backend/app/seed/insights.md`](../backend/app/seed/insights.md)
**저장소 밖** (상위 코디세이 저장소): `WORK_LOG.md` — 코드 작업 이력 · `AGENT_SYNC.md` — 세션 간 동기화

---

## 에이전트 팀용 읽기 가이드

작업 종류별로 **읽어야 할 최소 문서**만 적었다. 전부 읽지 않아도 된다.

| 맡은 일 | 읽을 문서 |
|---|---|
| **아무거나 시작 전 (공통)** | 이 파일 → [`context.md`](context.md) → [`decisions.md`](decisions.md) |
| **여러 에이전트로 나눠 작업** | [`roles/README.md`](roles/README.md) → 배정된 역할 브리핑 하나 |
| **역할을 배정받았다** | 해당 브리핑만 읽으면 된다 — [R1 UX](roles/R1-ux.md) · [R2 디자인](roles/R2-design.md) · [R3 백엔드](roles/R3-backend.md) · [R4 데이터](roles/R4-data.md) · [R5 품질](roles/R5-quality.md) · [R6 문서](roles/R6-docs.md) · [R0 조율](roles/R0-coordinator.md) |
| A9~A14 (여정 보강) | [`research/user-journey.md`](research/user-journey.md) + [`specs/A-product-ux.md`](specs/A-product-ux.md) |
| A15·A16·A19 (토큰·타이포·색) | [`design/design-system.md`](design/design-system.md) |
| A17·A12·A14 (컴포넌트) | [`design/components.md`](design/components.md) |
| A18·A21 (모션·대기 상태) | [`design/motion.md`](design/motion.md) |
| 디자인 판단 근거가 필요할 때 | [`design/emotional-design.md`](design/emotional-design.md) |
| B (데이터·분석) | [`specs/B-data.md`](specs/B-data.md) + `decisions.md` ③ |
| C (테스트·CI·운영) | [`specs/C-reliability-ops.md`](specs/C-reliability-ops.md) |
| E (문서·발표) | [`specs/E-docs.md`](specs/E-docs.md) + [`identity.md`](identity.md) |
| F (품질·접근성) | [`specs/F-quality.md`](specs/F-quality.md) + `design/design-system.md`(색 대비) |
| 우선순위 판단 | [`roadmap.md`](roadmap.md) |

### 작업 규칙

1. **스펙 ID는 불변이다.** `A9`, `B2` 같은 ID로 커밋·로그·보고를 연결한다. 폐기된 항목(`A3a`, `A5`, `D1`, `D2`)도 번호를 재사용하지 않는다.
2. **`decisions.md`의 결정 완료 항목은 재논의하지 않는다.** 뒤집을 근거가 생기면 결정을 새로 추가하고 이력을 남긴다.
3. **문서를 고치면 [`CHANGELOG.md`](CHANGELOG.md)에 한 줄 남긴다.**
4. **진행 상태는 [`roadmap.md`](roadmap.md) 한 곳에서만 관리한다.** 스펙 파일에 상태를 중복 기록하지 않는다.
5. 프로젝트 공통 제약(한국어 응답, 비밀키 커밋 금지 등)은 저장소 루트 규칙을 따른다.
