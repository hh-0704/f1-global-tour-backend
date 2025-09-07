# 🏎️ F1 Global Tour Backend

**OpenF1 API 기반 F1 리플레이 시스템 백엔드**

이 프로젝트는 F1 Global Tour 프론트엔드를 위한 백엔드 API 서버입니다. OpenF1 API를 활용하여 실제 F1 레이스 데이터를 가져오고, 프론트엔드에서 사용할 수 있도록 가공하여 제공하는 프록시 서버 역할을 합니다.

## ✨ 주요 기능

- **🔄 OpenF1 API 프록시**: 실제 F1 데이터 소스 연동 및 데이터 변환
- **📊 리플레이 시스템**: 역사적 F1 레이스 데이터의 시간순 재생 지원
- **⚡ 캐싱 시스템**: Redis 기반 고성능 데이터 캐싱으로 빠른 응답
- **🌐 CORS 지원**: 프론트엔드(localhost:3000)와 완벽 호환
- **🛡️ 에러 처리**: OpenF1 API 장애 시 안정적인 fallback 처리

## 🏗️ 기술 스택

- **Runtime**: Node.js 22+
- **Framework**: NestJS + TypeScript
- **API Client**: Axios (OpenF1 API 호출)
- **Caching**: Redis (데이터 캐싱 및 세션 관리)
- **Code Quality**: ESLint + Prettier
- **Testing**: Jest

## 🚀 빠른 시작

### 1. 환경 설정

```bash
# 환경 변수 파일 복사 및 설정
cp .env.example .env

# 필요한 환경 변수 수정
# PORT=4000
# OPENF1_API_BASE_URL=https://api.openf1.org/v1
# CORS_ORIGIN=http://localhost:3000
```

### 2. 설치 및 실행

```bash
# 의존성 설치
npm install

# 개발 서버 실행 (Hot Reload)
npm run start:dev

# 프로덕션 빌드 및 실행
npm run build
npm run start:prod
```

### 3. API 확인

서버가 실행되면 다음 주소에서 API에 접근할 수 있습니다:
- **Base URL**: `http://localhost:4000/api/v1`
- **Health Check**: `GET /api/v1` (기본 응답 확인)

## 📋 사용 가능한 명령어

### 개발 명령어
```bash
# 개발 서버 (Hot Reload)
npm run start:dev

# 프로덕션 모드
npm run start:prod

# 디버그 모드
npm run start:debug
```

### 코드 품질 관리
```bash
# ESLint 실행 (자동 수정)
npm run lint

# Prettier 포매팅
npm run format
```

### 테스트
```bash
# 단위 테스트
npm run test

# 테스트 watch 모드
npm run test:watch

# E2E 테스트
npm run test:e2e

# 테스트 커버리지
npm run test:cov
```

## 🏁 API 엔드포인트

### 세션 관리
```http
# 사용 가능한 세션 목록 조회
GET /api/v1/sessions?country=Belgium&year=2023

# 특정 세션의 드라이버 정보
GET /api/v1/sessions/{sessionKey}/drivers

# 세션 리플레이 시작 (데이터 캐싱)
POST /api/v1/sessions/{sessionKey}/start-replay
```

### API 응답 형식
모든 API는 다음과 같은 통일된 형식으로 응답합니다:

```json
{
  "success": true,
  "data": {
    // 응답 데이터
  },
  "timestamp": "2024-03-15T10:30:00.000Z"
}
```

에러 응답:
```json
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

## 🔧 개발 가이드

### 프로젝트 구조
```
src/
├── modules/           # 기능별 모듈 (sessions, drivers, etc.)
├── common/
│   ├── dto/          # API 응답 DTO
│   ├── filters/      # 예외 처리 필터
│   └── interfaces/   # OpenF1 API 인터페이스
├── config/           # 환경 설정
└── main.ts          # 애플리케이션 진입점
```

### 새로운 모듈 추가 시
1. `src/modules/{모듈명}` 디렉토리 생성
2. Controller, Service, Module 파일 작성
3. `src/common/interfaces/` 에 OpenF1 인터페이스 정의
4. `AppModule`에 모듈 등록

### 환경 변수 설정
- `PORT`: 서버 포트 (기본값: 4000)
- `OPENF1_API_BASE_URL`: OpenF1 API 기본 URL
- `CORS_ORIGIN`: 허용할 프론트엔드 오리진
- `REDIS_HOST`, `REDIS_PORT`: Redis 연결 정보

## 📚 참고 문서

- **[REPLAY_API_SPECIFICATION.md](./REPLAY_API_SPECIFICATION.md)**: 상세한 API 명세서
- **[CLAUDE.md](./CLAUDE.md)**: Claude Code를 위한 개발 가이드
- **[OpenF1 API 문서](https://openf1.org/)**: 원본 데이터 소스 문서

## 🤝 기여하기

1. 프로젝트를 포크합니다
2. 기능 브랜치를 생성합니다 (`git checkout -b feature/amazing-feature`)
3. 변경사항을 커밋합니다 (`git commit -m 'Add some amazing feature'`)
4. 브랜치에 푸시합니다 (`git push origin feature/amazing-feature`)
5. Pull Request를 생성합니다

## 📄 라이선스

이 프로젝트는 MIT 라이선스 하에 배포됩니다.
