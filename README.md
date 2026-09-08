# 나만의 AI 비서

> 대전 82개 행정동의 상권 점포수 시계열 데이터를 이해하고, 그 데이터를 근거로 맞춤형 답변을 주는 AI 비서 서비스. 코디세이 AI Native Advanced · "AI Agent 개발" 미션 결과물.

## 서비스 소개

일반적인 ChatGPT는 내 데이터를 모릅니다. 이 서비스는 시계열 데이터(대전 행정동별 점포수 추이)를 분석해 요약 정보를 만들고, 그 요약을 AI의 시스템 프롬프트에 주입해 "내 상황을 아는" 답변을 하도록 합니다. 데이터 CRUD, 대화 기록 저장/불러오기까지 포함한 하나의 완결된 애플리케이션입니다.

## 기술 스택

- 백엔드: FastAPI (Python), Firebase Firestore
- AI: OpenAI GPT API (컨텍스트 주입 방식)
- 프론트엔드: 바닐라 HTML/CSS/JavaScript (프레임워크 미사용)
- 배포: 백엔드 Render, 프론트엔드 Vercel

## 배포 URL

- 프론트엔드: https://frontend-lovat-rho-rea8xhh8wq.vercel.app
- 백엔드 API: https://my-data-assistant.onrender.com
- Swagger UI: https://my-data-assistant.onrender.com/docs

> ⚠️ 백엔드는 Render 무료 플랜이라 15분간 요청이 없으면 잠들며, 이후 첫 요청은 응답까지 30~50초 걸립니다(콜드 스타트). 잠시 기다리면 정상 동작합니다.

## 프로젝트 구조

```
my-data-assistant/
├── backend/
│   ├── main.py
│   ├── app/
│   │   ├── config.py            # 환경변수 로딩
│   │   ├── firestore_client.py  # Firestore 클라이언트 초기화
│   │   ├── models.py            # Pydantic 스키마
│   │   ├── routers/             # data / conversations / chat 엔드포인트
│   │   ├── services/            # 실제 비즈니스 로직 (Firestore·OpenAI 호출)
│   │   └── seed/seed_data.json  # 초기 시드 데이터 (492개 레코드)
│   ├── scripts/
│   │   ├── prepare_seed_data.py # 원본 CSV → 시드 JSON 변환
│   │   └── seed_firestore.py    # 시드 JSON → Firestore 적재
│   └── requirements.txt
└── frontend/
    ├── index.html
    ├── css/style.css
    └── js/                      # config·api·summary·chat·data·history
```

## 데이터 선정 및 분석

같은 학습 단계의 이전 프로젝트인 [daejeon-commercial-analysis](https://github.com/Frost0313z/daejeon-commercial-analysis)(대전 상권 데이터 분석)에서 만든 `dong_indicators_timeseries.csv`를 재사용합니다. 대전 82개 행정동 × 6개 분기(2025-03 ~ 2026-06)의 점포수를 `(date, value, memo)` 레코드 492개로 변환했습니다.

- `date`: 조사 시점 (분기 단위)
- `value`: 해당 행정동의 점포수
- `memo`: "구 동 (주력업종: OO업)"

`GET /api/data/summary`는 이 레코드들을 날짜순으로 정렬해 기간·개수·평균/최대/최소·추세(앞/뒤 절반 평균 비교)를 계산합니다.

## API 엔드포인트

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/data` | 데이터 목록 조회 |
| POST | `/api/data` | 데이터 추가 |
| PUT | `/api/data/{id}` | 데이터 수정 |
| DELETE | `/api/data/{id}` | 데이터 삭제 |
| GET | `/api/data/summary` | 요약 정보 (프롬프트 주입용) |
| GET | `/api/conversations` | 대화 목록 조회 |
| POST | `/api/conversations` | 대화 저장 |
| GET | `/api/conversations/{id}` | 대화 상세(messages 포함) 조회 |
| DELETE | `/api/conversations/{id}` | 대화 삭제 |
| POST | `/api/chat` | AI 채팅 (요약 조회 → 시스템 프롬프트 주입 → GPT 호출 → 대화 자동 저장) |

## 로컬 실행 방법

### 백엔드

```bash
cd backend
python -m venv venv
venv\Scripts\activate   # Windows
pip install -r requirements.txt
cp .env.example .env    # 값 채우기
uvicorn main:app --reload
```

`http://localhost:8000/docs`에서 Swagger UI 확인.

### 프론트엔드

`frontend/index.html`을 브라우저로 열거나(VSCode Live Server 등), 정적 서버로 서빙합니다. 로컬에서는 `js/config.js`의 기본값(`http://localhost:8000`)이 그대로 사용됩니다.

## 환경 변수

| 변수 | 위치 | 설명 |
|---|---|---|
| `OPENAI_API_KEY` | 백엔드 | OpenAI API 키 |
| `OPENAI_MODEL` | 백엔드 | 기본값 `gpt-4o-mini` |
| `CHAT_MAX_TOKENS` | 백엔드 | 응답 토큰 상한 (과금 방지) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | 백엔드 | 서비스 계정 키 경로 또는 JSON 문자열 |
| `ALLOWED_ORIGINS` | 백엔드 | CORS 허용 오리진(콤마 구분) |
| `API_BASE_URL` | 프론트엔드(Vercel) | 백엔드 배포 URL. 빌드 시 `build.js`가 `js/config.js`에 주입 |

## 설계 노트

- **데이터 구조를 이렇게 선택한 이유**: 미션이 요구하는 `(date, value, memo)` 단순 시계열 스키마에 맞추면서도, 이미 검증된 실제 분석 데이터(대전 상권)를 재사용해 "억지로 만든 숫자"가 아닌 의미 있는 데이터를 쓰고 싶었습니다. 행정동×분기를 개별 레코드로 풀어 492개를 확보했습니다.
- **컨텍스트 주입 흐름**: `/api/chat`은 매 호출마다 `/api/data/summary`를 다시 계산해 시스템 프롬프트에 넣습니다. 데이터가 바뀌면 다음 대화부터 즉시 반영됩니다.
- **라우터/서비스 분리 기준**: 라우터는 HTTP 계약(경로·요청/응답 스키마)만 담당하고, Firestore·OpenAI 호출 등 실제 로직은 `services/`에 몰아 테스트와 재사용이 쉽게 했습니다.
- **대화 저장 정책**: `/api/chat`은 매 턴마다 자동 저장(`conversation_id`가 없으면 새 대화 생성, 있으면 이어붙임). `/api/conversations`(POST)는 프론트에서 임의로 대화를 통째로 저장하고 싶을 때를 위한 보조 경로.
- **동명 항목·값 충돌 처리**: 데이터 레코드는 Firestore 자동 생성 ID로 구분하므로 같은 날짜·값이 중복되어도 별개 레코드로 취급합니다.

## 제출 스크린샷

_(배포 후 촬영하여 첨부: 데이터 요약이 보이는 채팅 화면 / 데이터 관리 CRUD 동작 화면 / 대화 기록 불러오기 화면)_

## 라이선스

MIT
