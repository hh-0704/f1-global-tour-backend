# F1 Global Tour Backend Architecture Plan

## 개요 (Overview)

본 문서는 **F1 Global Tour Backend** 확장 및 개선을 위한 종합적인 아키텍처 계획을 제시합니다. 현재 기본적인 NestJS 구조가 구축되어 있으며, OpenF1 API를 활용한 F1 레이스 리플레이 시스템의 완전한 구현을 목표로 합니다.

## 현재 상태 분석 (Current State Analysis)

### ✅ 구현 완료 (2025-09-08 업데이트)
- NestJS 기본 프로젝트 구조
- TypeScript 설정 및 ESLint/Prettier 구성  
- 기본적인 HTTP 예외 처리 필터
- OpenF1 API 인터페이스 정의 (완전)
- **HTTP 클라이언트 시스템 (Phase 1.1 완료)**
  - `OpenF1ClientService`: 모든 OpenF1 API 엔드포인트 지원
  - 강력한 에러 처리 및 로깅 시스템
  - Query Parameters 인터페이스 완비
- **Redis 캐싱 시스템 (Phase 1.2 완료)**
  - `CacheService`: Redis 연결 관리 및 캐시 작업
  - `CachedOpenF1ClientService`: 스마트 캐싱 레이어
  - 세션 기반 캐시 키 전략
  - 데이터별 차별화된 TTL 정책
- **Sessions 모듈 완성**
  - 실제 OpenF1 API 연동
  - 리플레이 데이터 프리로딩 기능
  - 캐싱 통합 완료
- **서버 실행 성공**
  - 포트 4000에서 정상 동작
  - API 엔드포인트 매핑 완료
  - Redis 연결 대기 상태 (선택사항)

### ✅ 완료된 기능들 (Phase 2 완료)
- ✅ 모든 핵심 모듈 구현 완료 (Sessions, Drivers, Laps, Intervals, CarData, RaceControl, Stints)
- ✅ 데이터 변환 로직 구현 (DRS, 세그먼트, DNF 처리)
- ✅ 포괄적인 F1 데이터 분석 기능
- ✅ 텔레메트리, 타이어 전략, 레이스 컨트롤 분석

### 🚧 다음 구현 단계 (Phase 3)
- Circuit Breaker 패턴 구현 (API 장애 대응)
- 성능 최적화 (압축, 병렬 처리)
- 모니터링 및 로깅 시스템 강화
- 종합 테스트 및 프로덕션 준비

## 아키텍처 목표 (Architecture Goals)

1. **성능 최적화**: Redis를 활용한 효율적인 데이터 캐싱
2. **확장성**: 모듈식 구조로 새로운 기능 추가 용이성
3. **안정성**: OpenF1 API 장애 대응 및 에러 처리
4. **데이터 무결성**: OpenF1 API 데이터의 정확한 변환 및 전달

## 세부 구현 계획 (Detailed Implementation Plan)

### 1. 데이터 레이어 구축

#### ✅ 1.1 HTTP 클라이언트 설정 (완료)
```typescript
// src/common/services/openf1-client.service.ts - 구현 완료
@Injectable()
export class OpenF1ClientService {
  async fetchSessions(params: SessionsQueryParams): Promise<OpenF1Session[]>;
  async fetchDrivers(params: DriversQueryParams): Promise<OpenF1Driver[]>;
  async fetchLaps(params: LapsQueryParams): Promise<OpenF1Lap[]>;
  async fetchCarData(params: CarDataQueryParams): Promise<OpenF1CarData[]>;
  async fetchIntervals(params: IntervalsQueryParams): Promise<OpenF1Interval[]>;
  async fetchRaceControl(params: RaceControlQueryParams): Promise<OpenF1RaceControl[]>;
  async fetchStints(params: StintsQueryParams): Promise<OpenF1Stint[]>;
}

// src/common/services/cached-openf1-client.service.ts - 캐싱 레이어 완료
@Injectable()
export class CachedOpenF1ClientService {
  // 모든 API 호출에 스마트 캐싱 적용
  // 리플레이 데이터 프리로딩 기능 포함
}
```

#### ✅ 1.2 Redis 캐싱 전략 (완료)
- **세션별 캐싱**: `session:${sessionKey}:drivers`, `session:${sessionKey}:laps` ✅
- **차별화된 TTL 정책** ✅:
  - Sessions: 1시간 (변경 없음)
  - Drivers: 30분 (안정적)
  - Laps: 15분 (중간 빈도)
  - Intervals: 5분 (실시간성)
  - Telemetry: 10분 (대용량)
  - Stints: 30분 (타이어 정보)
- **캐시 무효화**: 세션별 패턴 삭제 기능 ✅
- **리플레이 프리로딩**: 세션 시작 시 모든 데이터 병렬 로딩 ✅

### 2. 모듈 구조 확장

#### ✅ 2.1 새로운 모듈 추가 (완료 - 2025.09.08)
```
src/modules/
├── sessions/          # ✅ 완료 (Phase 1)
├── drivers/           # ✅ 완료 (Phase 2.1)
├── laps/             # ✅ 완료 (Phase 2.1)  
├── intervals/        # ✅ 완료 (Phase 2.1)
├── car-data/         # ✅ 완료 (Phase 2.2)
├── race-control/     # ✅ 완료 (Phase 2.2)
└── stints/           # ✅ 완료 (Phase 2.2)
```

**구현된 모듈 상세**:
- **Drivers 모듈**: 드라이버 정보, 텔레메트리, 랩 데이터, 성능 통계
- **Laps 모듈**: 세션/드라이버별 랩 데이터, 분석, 최고 랩타임
- **Intervals 모듈**: 실시간 인터벌, 순위, 갭 분석, 레이스 진행 상황
- **CarData 모듈**: 텔레메트리 데이터, 속도/기어/DRS 분석, 드라이버 비교
- **RaceControl 모듈**: 레이스 메시지, 플래그, 인시던트, 안전차 분석
- **Stints 모듈**: 타이어 전략, 피트스톱, 타이어 성능 및 마모도 분석

#### 2.2 각 모듈 구조
```typescript
// 예시: src/modules/laps/
├── laps.controller.ts    # API 엔드포인트
├── laps.service.ts       # 비즈니스 로직
├── laps.module.ts        # 모듈 설정
├── dto/                  # 요청/응답 DTO
└── interfaces/           # 모듈별 인터페이스
```

### 3. 데이터 변환 로직 구현

#### 3.1 핵심 변환 규칙
```typescript
// src/common/transformers/
├── drs.transformer.ts          # DRS 값 → boolean 변환
├── segment.transformer.ts      # 세그먼트 → 색상 변환  
├── lap-status.transformer.ts   # null lap_duration → DNF 처리
└── pit-detection.transformer.ts # 세그먼트 2064 → pit 상태
```

#### 3.2 DRS 변환 로직
```typescript
export class DRSTransformer {
  static transform(drsValue: number): { enabled: boolean; available: boolean } {
    const DRS_MAPPING = {
      0: { enabled: false, available: false },
      1: { enabled: false, available: false },
      8: { enabled: false, available: true },
      10: { enabled: true, available: true },
      12: { enabled: true, available: true },
      14: { enabled: true, available: true }
    };
    return DRS_MAPPING[drsValue] || { enabled: false, available: false };
  }
}
```

### 4. API 엔드포인트 설계

#### 4.1 REST API 구조
```
GET /api/v1/sessions                    # 세션 목록
GET /api/v1/sessions/:sessionKey/drivers # 드라이버 목록
POST /api/v1/replay/:sessionKey/start   # 리플레이 시작
GET /api/v1/replay/:sessionKey/laps     # 랩 데이터
GET /api/v1/replay/:sessionKey/telemetry/:driverNumber # 텔레메트리
GET /api/v1/replay/:sessionKey/intervals # 인터벌 데이터
GET /api/v1/replay/:sessionKey/race-control # 레이스 컨트롤
GET /api/v1/replay/:sessionKey/stints   # 스틴트 정보
```

#### 4.2 응답 형식 표준화
```typescript
export class ApiResponseDto<T> {
  success: boolean;
  data: T;
  message?: string;
  errorCode?: string;
  timestamp: string;
}
```

### 5. 에러 처리 전략

#### 5.1 OpenF1 API 에러 대응
```typescript
export enum ErrorCodes {
  OPENF1_API_UNAVAILABLE = 'OPENF1_001',
  SESSION_NOT_FOUND = 'SESSION_001',
  DRIVER_NOT_FOUND = 'DRIVER_001',
  CACHE_ERROR = 'CACHE_001',
  DATA_TRANSFORMATION_ERROR = 'TRANSFORM_001'
}
```

#### 5.2 Circuit Breaker 패턴
- OpenF1 API 연속 실패 시 자동 차단
- 복구 로직 및 fallback 데이터 제공

### 6. 캐싱 전략 세부사항

#### 6.1 리플레이 캐싱 프로세스
1. **초기 로딩**: 사용자가 세션 선택 시 모든 데이터 미리 캐싱
2. **점진적 로딩**: 큰 데이터는 랩별로 분할하여 캐싱
3. **메모리 관리**: LRU 정책으로 오래된 캐시 데이터 정리

#### 6.2 캐시 키 전략
```typescript
// 캐시 키 패턴
const CACHE_KEYS = {
  SESSION_DRIVERS: (sessionKey: number) => `session:${sessionKey}:drivers`,
  LAP_DATA: (sessionKey: number, lapNumber: number) => `session:${sessionKey}:lap:${lapNumber}`,
  CAR_DATA: (sessionKey: number, driverNumber: number) => `session:${sessionKey}:driver:${driverNumber}:telemetry`,
  RACE_CONTROL: (sessionKey: number) => `session:${sessionKey}:race-control`,
  INTERVALS: (sessionKey: number) => `session:${sessionKey}:intervals`,
  STINTS: (sessionKey: number) => `session:${sessionKey}:stints`
};
```

### 7. 성능 최적화 계획

#### 7.1 데이터 압축
- JSON 응답 gzip 압축
- 큰 텔레메트리 데이터 청킹

#### 7.2 병렬 처리
- 여러 OpenF1 API 동시 호출
- 독립적인 데이터는 비동기 처리

### 8. 보안 및 운영

#### 8.1 환경 설정
```typescript
// .env.example
OPENF1_API_BASE_URL=https://api.openf1.org/v1
REDIS_URL=redis://localhost:6379
CORS_ORIGIN=http://localhost:3000
API_RATE_LIMIT=100
CACHE_TTL=86400
```

#### 8.2 모니터링 및 로깅
- Winston 로거 통합
- API 응답 시간 메트릭
- OpenF1 API 상태 헬스체크

### 9. 개발 우선순위

#### ✅ Phase 1: 핵심 기능 구현 (완료 - 2025.09.08)
1. ✅ HTTP 클라이언트 서비스 구현 (`OpenF1ClientService`)
2. ✅ Redis 캐싱 시스템 구축 (`CacheService` + `CachedOpenF1ClientService`)
3. ✅ Sessions 모듈 완성 (OpenF1 API 연동 + 캐싱)
4. ✅ 서버 실행 및 API 엔드포인트 확인

#### ✅ Phase 2: 데이터 변환 및 고급 기능 (완료 - 2025.09.08)  
1. ✅ 추가 모듈 구현 (Drivers, Laps, Intervals) - **완료**
2. ✅ 기본 데이터 변환 로직 (DRS, 세그먼트, DNF) - **완료**
3. ✅ 고급 모듈 구현 (CarData, RaceControl, Stints) - **완료**
4. 🟡 에러 처리 시스템 강화 (Circuit Breaker 패턴) - **Phase 3로 이동**
5. 🟡 성능 최적화 (압축, 병렬 처리) - **Phase 3로 이동**

#### 🔮 Phase 3: 완성 및 최적화 (계획)
1. ✅ RaceControl, Stints 모듈 구현 - **완료**
2. 🟡 Circuit Breaker 패턴 구현 (OpenF1 API 장애 대응)
3. 🟡 성능 최적화 (압축, 병렬 처리, 데이터 청킹)
4. 🟡 종합 테스트 및 디버깅
5. 🟡 모니터링 및 로깅 강화
6. 🟡 문서화 및 배포 준비

### 10. 기술 스택 확정

```json
{
  "runtime": "Node.js 22+",
  "framework": "NestJS 10+",
  "database": "Redis 4+ (캐싱)",
  "httpClient": "@nestjs/axios + axios",
  "validation": "class-validator + class-transformer",
  "testing": "Jest + Supertest",
  "monitoring": "Winston (로깅)"
}
```

### 11. 배포 및 인프라

#### 11.1 Docker 컨테이너화
```dockerfile
# Dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 4000
CMD ["node", "dist/main"]
```

#### 11.2 환경별 구성
- **개발**: 로컬 Redis, 상세 로깅
- **스테이징**: 외부 Redis, 중간 로깅  
- **프로덕션**: 클러스터 Redis, 최소 로깅

## 결론

이 계획에 따라 구현하면 안정적이고 확장 가능한 F1 리플레이 백엔드 시스템을 구축할 수 있습니다. 현재 기본 구조가 잘 잡혀 있어 단계별로 착실히 구현해 나가면 성공적인 프로젝트가 될 것으로 예상됩니다.

특히 OpenF1 API의 특성을 잘 이해하고 데이터 변환 로직을 정확히 구현하는 것이 핵심 성공 요소입니다.