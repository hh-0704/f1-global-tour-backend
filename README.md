# 🏎️ F1 Global Tour — Backend

<div align="center">
  <img src="https://img.shields.io/badge/Node.js-22+-339933?style=for-the-badge&logo=node.js&logoColor=white" />
  <img src="https://img.shields.io/badge/NestJS-10-E0234E?style=for-the-badge&logo=nestjs&logoColor=white" />
  <img src="https://img.shields.io/badge/TypeScript-5.0-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/OpenF1_API-연동-FF1801?style=for-the-badge" />
</div>

<div align="center">
  <h3>F1 Global Tour 서비스의 백엔드 API 서버</h3>
  <p>OpenF1 공개 API를 연동하여 F1 세션·랩·텔레메트리 데이터를 가공·제공합니다</p>
</div>

---

## 🔗 관련 레포지토리

| 역할 | 레포지토리 | 기술 스택 |
|---|---|---|
| **Frontend** | [Jeong-baechoo/f1-global-tour](https://github.com/Jeong-baechoo/f1-global-tour) | Next.js 15 · Mapbox GL · Tailwind CSS |
| **Backend** | 현재 레포지토리 | NestJS · TypeScript · OpenF1 API |

## 🗺️ 시스템 아키텍처

```
[사용자 브라우저]
      │
      ▼
[Frontend: Next.js]  ←─────────────────────────────┐
      │  HTTP (localhost:3000)                       │
      ▼                                              │
[Backend: NestJS :4000]                             │
  ├─ /api/v1/sessions      ← 세션 목록·드라이버·리플레이  │
  ├─ /api/v1/laps          ← 랩 타임 데이터             │
  └─ /api/v1/sessions/.../telemetry ← 텔레메트리       │
      │                                              │
      ▼                                              │
[OpenF1 Public API]  ─── 실제 F1 데이터 소스 ──────────┘
```

백엔드는 OpenF1 API의 **프록시 + 데이터 가공 레이어** 역할을 합니다.
응답 데이터는 인메모리 캐시(10분)에 저장되어 반복 요청 시 빠르게 제공됩니다.

---

## ✨ 주요 기능

- **🔄 OpenF1 API 연동**: 실제 F1 레이스 데이터 수집 및 변환
- **🏁 리플레이 시스템**: 레이스 전체를 2초 단위 프레임으로 가공하여 순위·인터벌·타이어 정보 제공
- **🚩 레이스 플래그**: 랩별/분별 Safety Car, VSC, 레드플래그 이벤트 추출
- **📡 텔레메트리**: 드라이버별 speed, gear, throttle, brake, DRS 데이터 제공
- **⚡ 인메모리 캐싱**: 첫 요청 후 10분간 캐시하여 중복 OpenF1 API 호출 방지
- **📘 Swagger UI**: `/api/docs` 에서 전체 API 명세 확인 가능
- **🛡️ 글로벌 예외 처리**: `HttpExceptionFilter`로 통일된 에러 응답 형식 유지

---

## 🏗️ 기술 스택

| 분류 | 기술 |
|---|---|
| Runtime | Node.js 22+ |
| Framework | NestJS + TypeScript |
| HTTP Client | Axios (OpenF1 API 호출) |
| API 문서 | Swagger (OpenAPI 3.0) |
| 코드 품질 | ESLint + Prettier |
| 테스트 | Jest |

---

## 🚀 빠른 시작

### 1. 환경 변수 설정

```bash
cp .env.example .env
```

```env
PORT=4000
OPENF1_API_BASE_URL=https://api.openf1.org/v1
CORS_ORIGIN=http://localhost:3000
```

### 2. 설치 및 실행

```bash
# 의존성 설치
npm install

# 개발 서버 (Hot Reload)
npm run start:dev
```

### 3. 동작 확인

| 경로 | 설명 |
|---|---|
| `http://localhost:4000/api/v1/health` | 서버 상태 확인 |
| `http://localhost:4000/api/docs` | Swagger API 문서 |

---

## 📋 API 엔드포인트

### Sessions

```http
# 세션 목록 조회 (country, year 필터 지원)
GET /api/v1/sessions?country=Belgium&year=2023

# 세션 드라이버 목록 조회
GET /api/v1/sessions/:sessionKey/drivers

# 리플레이 프레임 전체 조회 (2초 단위 DriverDisplayFrame[])
# ⚠️ 첫 요청은 OpenF1 API를 4회 순차 호출하므로 수십 초 소요될 수 있음
GET /api/v1/sessions/:sessionKey/driver-timings

# 레이스 플래그 정보 (랩별/분별 Safety Car, VSC 등)
GET /api/v1/sessions/:sessionKey/race-flags

# 리플레이 데이터 프리로드 (drivers·laps·intervals·stints 미리 수집)
POST /api/v1/sessions/:sessionKey/start-replay
```

### Laps

```http
# 세션 전체 랩 데이터 조회 (lapNumber 지정 시 해당 랩만 반환)
GET /api/v1/laps/session/:sessionKey?lapNumber=5
```

### Telemetry

```http
# 드라이버 텔레메트리 (speed·gear·throttle·brake·DRS, 0.5초 간격)
GET /api/v1/sessions/:sessionKey/telemetry/:driverNumber
```

### 공통 응답 형식

```json
// 성공
{
  "success": true,
  "data": { ... },
  "timestamp": "2024-03-15T10:30:00.000Z"
}

// 실패
{
  "success": false,
  "error": {
    "code": "OPENF1_API_UNAVAILABLE",
    "message": "OpenF1 API is currently unavailable",
    "details": {}
  },
  "timestamp": "2024-03-15T10:30:00.000Z"
}
```

---

## 🔧 프로젝트 구조

```
src/
├── modules/
│   ├── sessions/          # 세션·드라이버·리플레이·플래그
│   │   ├── sessions.controller.ts
│   │   ├── sessions.service.ts
│   │   └── race-flags.service.ts
│   ├── laps/              # 랩 타임 데이터
│   ├── telemetry/         # 드라이버 텔레메트리
│   └── health/            # 서버 상태 체크
├── common/
│   ├── constants/         # 공통 상수
│   ├── dto/               # API 응답 DTO (ApiResponseDto)
│   ├── filters/           # 글로벌 예외 처리 필터
│   ├── interfaces/        # OpenF1 API 응답 인터페이스
│   ├── services/          # 공통 서비스 (OpenF1 HTTP 클라이언트 등)
│   └── utils/             # 유틸리티 함수
├── config/                # 환경 변수 설정
└── main.ts                # 애플리케이션 진입점 (Swagger 설정 포함)
```

---

## 📝 개발 명령어

```bash
# 개발 서버 (Hot Reload)
npm run start:dev

# 프로덕션 빌드 및 실행
npm run build && npm run start:prod

# 린트
npm run lint

# 테스트
npm run test
npm run test:watch
npm run test:cov

# E2E 테스트
npm run test:e2e
```

---

## 📚 참고 문서

- **[REPLAY_API_SPECIFICATION.md](./REPLAY_API_SPECIFICATION.md)**: 리플레이 API 상세 명세
- **[CLAUDE.md](./CLAUDE.md)**: 개발 가이드
- **[OpenF1 API 문서](https://openf1.org/)**: 원본 데이터 소스

---

## 📄 라이선스

MIT License
