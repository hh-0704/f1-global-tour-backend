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
- **서버 실행 부분 성공**
  - 포트 4000에서 실행 중이나 재시작 이슈 있음
  - API 엔드포인트 매핑 기본 완료
  - Redis 연결 대기 상태 (선택사항)
  - ⚠️ 서버 안정성 개선 필요

### 🟡 부분 완료된 기능들 (Phase 2 진행 중)
- 🟡 모든 핵심 모듈 기본 구조 완료 (Sessions, Drivers, Laps, Intervals, CarData, RaceControl, Stints)
- ✅ 데이터 변환 로직 구현 (DRS, 세그먼트, DNF 처리)
- 🟡 F1 데이터 분석 기능 (구조는 완료, 완전한 비즈니스 로직 검증 필요)
- 🟡 텔레메트리, 타이어 전략, 레이스 컨트롤 분석 (기본 구현 완료, 안정성 검증 필요)

### 🚧 다음 구현 단계 (Phase 3.0 - 우선 순위)
- ⚠️ **서버 안정화**: 재시작 이슈 해결 및 안정성 확보
- 🔍 **API 완성도 검증**: 모든 엔드포인트 동작 테스트
- 🧪 **기본 테스트 추가**: 핵심 기능 단위 테스트
- 🛡️ **에러 처리 완성**: 예외 상황 대응 강화

### 🔮 향후 구현 단계 (Phase 3.1+)
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

#### ✅ 2.2 실제 구현된 모듈 구조 (완료)
```typescript
// 실제 구현: 모든 모듈이 3파일 구조로 통일
src/modules/
├── car-data/
│   ├── car-data.controller.ts    # API 엔드포인트 (6개)
│   ├── car-data.service.ts       # 텔레메트리 분석 로직
│   └── car-data.module.ts        # 모듈 설정
├── drivers/
│   ├── drivers.controller.ts     # API 엔드포인트 (6개)
│   ├── drivers.service.ts        # 드라이버 데이터 처리
│   └── drivers.module.ts         # 모듈 설정
├── laps/
│   ├── laps.controller.ts        # API 엔드포인트 (5개)
│   ├── laps.service.ts           # 랩 데이터 분석
│   └── laps.module.ts            # 모듈 설정
├── intervals/
│   ├── intervals.controller.ts   # API 엔드포인트 (5개)
│   ├── intervals.service.ts      # 실시간 순위 분석
│   └── intervals.module.ts       # 모듈 설정
├── race-control/
│   ├── race-control.controller.ts # API 엔드포인트 (6개)
│   ├── race-control.service.ts   # 레이스 메시지 분석
│   └── race-control.module.ts    # 모듈 설정
├── stints/
│   ├── stints.controller.ts      # API 엔드포인트 (6개)
│   ├── stints.service.ts         # 타이어 전략 분석
│   └── stints.module.ts          # 모듈 설정
├── sessions/
│   ├── sessions.controller.ts    # API 엔드포인트 (4개)
│   ├── sessions.service.ts       # 세션 관리
│   └── sessions.module.ts        # 모듈 설정
└── health/                       # Phase 3.1에서 추가
    ├── health.controller.ts      # Circuit Breaker 모니터링 (3개)
    ├── health.service.ts         # 시스템 상태 체크
    └── health.module.ts          # 모듈 설정
```

**구조 특징**:
- ✅ **단순한 3파일 구조**: Controller, Service, Module로 통일
- ✅ **공통 DTO 활용**: `src/common/dto/api-response.dto.ts` 전역 사용
- ✅ **공통 인터페이스**: `src/common/interfaces/` 디렉토리에서 OpenF1 타입 관리
- ✅ **BaseF1Service 상속**: 모든 서비스가 공통 기능 상속
- ✅ **총 8개 모듈**: 7개 F1 데이터 모듈 + 1개 Health 모듈

### 3. 데이터 변환 로직 구현

#### ✅ 3.1 핵심 변환 규칙 (완료)
```typescript
// src/common/utils/f1-transformations.util.ts - 통합 구현 완료
export class F1TransformationsUtil {
  // DRS 값 → boolean 변환
  static transformDRS(drsValue: number | null): { enabled: boolean; available: boolean }
  
  // 세그먼트 → 미니섹터 성능 변환
  static transformSegments(segments: number[]): string[]
  
  // null lap_duration → DNF 처리
  static isDNF(lapDuration: string | null): boolean
  
  // 세그먼트 2064 → 피트레인 감지
  static isPitLane(segments: number[]): boolean
}
```

**구현 완료 기능**:
- ✅ **DRS 변환**: OpenF1 DRS 코드 (0,1,8,10,12,14) → `{enabled, available}` 객체
- ✅ **세그먼트 변환**: 세그먼트 배열 → 미니섹터 성능 표시 ('green', 'yellow', 'purple')
- ✅ **DNF 감지**: null `lap_duration` → DNF 상태 판별
- ✅ **피트레인 감지**: 세그먼트 2064 → 피트레인 통과 여부

#### ✅ 3.2 실제 구현된 변환 로직 (완료)
```typescript
// src/common/utils/f1-transformations.util.ts - 실제 구현
export class F1TransformationsUtil {
  private static readonly DRS_MAPPING = {
    0: { enabled: false, available: false },
    1: { enabled: false, available: false }, 
    8: { enabled: false, available: true },
    10: { enabled: true, available: true },
    12: { enabled: true, available: true },
    14: { enabled: true, available: true }
  };

  static transformDRS(drsValue: number | null): { enabled: boolean; available: boolean } {
    if (drsValue === null || drsValue === undefined) {
      return { enabled: false, available: false };
    }
    return this.DRS_MAPPING[drsValue] || { enabled: false, available: false };
  }

  static transformSegments(segments: number[]): string[] {
    return segments.map(segment => {
      if (segment === 2048) return 'green';   // 개선된 구간
      if (segment === 2049) return 'yellow';  // 비슷한 구간
      if (segment === 2051) return 'purple';  // 개인 최고
      if (segment === 2064) return 'pit';     // 피트레인
      return 'unknown';
    });
  }

  static isDNF(lapDuration: string | null): boolean {
    return lapDuration === null || lapDuration === undefined;
  }

  static isPitLane(segments: number[]): boolean {
    return segments.includes(2064);
  }
}
```

### ✅ 4. API 엔드포인트 설계 (완료)

#### ✅ 4.1 REST API 구조 (모두 구현 완료)
```
# 세션 관리 (4개 엔드포인트) ✅
GET /api/v1/sessions                        # 세션 목록
GET /api/v1/sessions/:sessionKey/drivers    # 세션별 드라이버 목록
POST /api/v1/sessions/:sessionKey/start-replay # 리플레이 시작
DELETE /api/v1/sessions/:sessionKey/cache   # 캐시 삭제

# F1 데이터 엔드포인트 (40개+) ✅ 
# Drivers 모듈 (6개)
GET /api/v1/drivers                         # 드라이버 목록
GET /api/v1/drivers/:sessionKey             # 세션별 드라이버 정보
GET /api/v1/drivers/:sessionKey/:driverNumber # 특정 드라이버 상세
GET /api/v1/drivers/:sessionKey/:driverNumber/telemetry # 드라이버 텔레메트리
GET /api/v1/drivers/:sessionKey/:driverNumber/laps # 드라이버 랩 데이터
GET /api/v1/drivers/:sessionKey/:driverNumber/performance # 성능 통계

# Laps 모듈 (5개)
GET /api/v1/laps/:sessionKey                # 세션별 랩 데이터
GET /api/v1/laps/:sessionKey/driver/:driverNumber # 드라이버별 랩
GET /api/v1/laps/:sessionKey/fastest        # 최고 랩타임
GET /api/v1/laps/:sessionKey/analysis       # 랩 분석
GET /api/v1/laps/:sessionKey/statistics     # 랩 통계

# Intervals 모듈 (5개)
GET /api/v1/intervals/:sessionKey           # 인터벌 데이터
GET /api/v1/intervals/:sessionKey/at-time   # 특정 시간 순위
GET /api/v1/intervals/:sessionKey/gaps      # 갭 분석
GET /api/v1/intervals/:sessionKey/positions # 포지션 변화
GET /api/v1/intervals/:sessionKey/race-progress # 레이스 진행상황

# CarData 모듈 (6개)
GET /api/v1/car-data/:sessionKey            # 텔레메트리 데이터
GET /api/v1/car-data/:sessionKey/driver/:driverNumber # 드라이버별 텔레메트리
GET /api/v1/car-data/:sessionKey/speed-analysis # 속도 분석
GET /api/v1/car-data/:sessionKey/drs-analysis # DRS 분석
GET /api/v1/car-data/:sessionKey/gear-analysis # 기어 분석
GET /api/v1/car-data/:sessionKey/compare    # 드라이버 비교

# RaceControl 모듈 (6개)
GET /api/v1/race-control/:sessionKey        # 레이스 컨트롤 메시지
GET /api/v1/race-control/:sessionKey/flags  # 플래그 정보
GET /api/v1/race-control/:sessionKey/safety-car # 안전차 분석
GET /api/v1/race-control/:sessionKey/incidents # 인시던트 목록
GET /api/v1/race-control/:sessionKey/timeline # 레이스 타임라인
GET /api/v1/race-control/:sessionKey/statistics # 레이스 통계

# Stints 모듈 (6개)
GET /api/v1/stints/:sessionKey              # 스틴트 데이터
GET /api/v1/stints/:sessionKey/driver/:driverNumber # 드라이버별 스틴트
GET /api/v1/stints/:sessionKey/tire-strategy # 타이어 전략 분석
GET /api/v1/stints/:sessionKey/pit-stops    # 피트스톱 분석
GET /api/v1/stints/:sessionKey/tire-performance # 타이어 성능
GET /api/v1/stints/:sessionKey/wear-analysis # 타이어 마모도 분석

# 시스템 모니터링 (3개) ✅ Phase 3.1에서 추가
GET /api/v1/health                          # 전체 시스템 상태
GET /api/v1/health/circuit-breaker          # Circuit Breaker 통계
POST /api/v1/health/circuit-breaker/reset   # Circuit Breaker 리셋

총 43개 API 엔드포인트 기본 구조 완료 (안정성 검증 필요) 🟡
```

#### ✅ 4.2 응답 형식 표준화 (구현 완료)
```typescript
// src/common/dto/api-response.dto.ts - 구현 완료
export class ApiResponseDto<T> {
  sessionKey: number;
  data: T;
  timestamp: string;
}

// 실제 구현: BaseF1Service.createResponse() 메서드 사용
export class BaseF1Service {
  protected createResponse<T>(
    sessionKey: number, 
    data: T, 
    metadata?: Record<string, any>
  ): ApiResponseDto<T> & Record<string, any> {
    return {
      sessionKey,
      data,
      timestamp: new Date().toISOString(),
      ...metadata,
    };
  }
}
```

**구현 상태**: 🟡 대부분의 API가 일관된 응답 형식 사용 (완전성 검증 필요)

### ✅ 5. 에러 처리 전략 (구현 완료)

#### ✅ 5.1 OpenF1 API 에러 대응 (구현 완료)
```typescript
// src/common/filters/http-exception.filter.ts - 구현 완료
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private getErrorCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'RATE_LIMIT_EXCEEDED';
      case HttpStatus.SERVICE_UNAVAILABLE:
        return 'OPENF1_API_UNAVAILABLE';  // ✅ OpenF1 API 에러 처리
      default:
        return 'INTERNAL_SERVER_ERROR';
    }
  }
}
```

**구현 완료 기능**:
- ✅ **글로벌 에러 필터**: 모든 HTTP 예외를 표준화된 형식으로 처리
- ✅ **OpenF1 API 에러 매핑**: SERVICE_UNAVAILABLE → OPENF1_API_UNAVAILABLE
- ✅ **일관된 에러 응답**: ApiResponseDto.error() 형식 사용
- ✅ **상태 코드별 에러 코드**: 각 HTTP 상태에 맞는 에러 코드 매핑

#### ✅ 5.2 Circuit Breaker 패턴 (완료)
```typescript
// src/common/services/circuit-breaker.service.ts - 구현 완료
export enum CircuitBreakerState {
  CLOSED = 'CLOSED',     // 정상 동작
  OPEN = 'OPEN',         // 차단 상태 (요청 차단) 
  HALF_OPEN = 'HALF_OPEN' // 반개방 상태 (테스트 요청)
}

@Injectable()
export class CircuitBreakerService {
  async execute<T>(
    operation: () => Promise<T>,
    fallbackData?: T
  ): Promise<T> {
    // Circuit Breaker 로직으로 안전한 API 호출
  }
}
```

**구현 완료 기능**:
- ✅ **3상태 관리**: CLOSED(정상) → OPEN(차단) → HALF_OPEN(복구시도)
- ✅ **실패 임계값**: 5회 연속 실패 시 자동 차단
- ✅ **자동 복구**: 30초 후 복구 시도 
- ✅ **Fallback 데이터**: API 차단 시 대체 데이터 반환
- ✅ **통계 수집**: 요청/성공/실패 카운터 및 상태 추적
- ✅ **Health API**: `/api/v1/health/circuit-breaker` 모니터링 엔드포인트
- ✅ **수동 리셋**: `/api/v1/health/circuit-breaker/reset` 복구 API

---

## 🔮 향후 구현 계획 (Phase 3.2+)

### 6. 성능 최적화 (Phase 3.2 - 미구현)

#### 6.1 데이터 압축
- JSON 응답 gzip 압축
- 큰 텔레메트리 데이터 청킹

#### 6.2 병렬 처리
- 여러 OpenF1 API 동시 호출
- 독립적인 데이터는 비동기 처리

### 7. 캐싱 전략 고도화 (Phase 3.3 - 미구현)

#### 7.1 리플레이 캐싱 프로세스
1. **초기 로딩**: 사용자가 세션 선택 시 모든 데이터 미리 캐싱
2. **점진적 로딩**: 큰 데이터는 랩별로 분할하여 캐싱
3. **메모리 관리**: LRU 정책으로 오래된 캐시 데이터 정리

#### 7.2 캐시 키 확장 전략
```typescript
// 추가 캐시 키 패턴 (미구현)
const EXTENDED_CACHE_KEYS = {
  LAP_DATA: (sessionKey: number, lapNumber: number) => `session:${sessionKey}:lap:${lapNumber}`,
  CAR_DATA: (sessionKey: number, driverNumber: number) => `session:${sessionKey}:driver:${driverNumber}:telemetry`,
  // 현재는 세션별 기본 캐싱만 구현됨
};
```

### 8. 모니터링 및 로깅 강화 (Phase 3.4 - 미구현)

#### 8.1 로깅 시스템 확장
- Winston 로거 세부 설정
- API 응답 시간 메트릭
- 구조화된 로그 포맷

#### 8.2 성능 모니터링
- 메모리 사용량 추적
- API 엔드포인트별 성능 분석
- 슬로우 쿼리 감지

### 9. 보안 및 운영 (Phase 3.5 - 미구현)

#### 9.1 환경 설정 확장
```typescript
// 추가 환경 변수 (미구현)
API_RATE_LIMIT=100
CACHE_TTL_EXTENDED=86400
LOG_LEVEL=info
PERFORMANCE_MONITORING=true
```

#### 9.2 보안 강화
- Rate Limiting 구현
- API 키 관리 시스템
- 요청 검증 강화

### 9. 개발 우선순위

#### ✅ Phase 1: 핵심 기능 구현 (완료 - 2025.09.08)
1. ✅ HTTP 클라이언트 서비스 구현 (`OpenF1ClientService`)
2. ✅ Redis 캐싱 시스템 구축 (`CacheService` + `CachedOpenF1ClientService`)
3. ✅ Sessions 모듈 완성 (OpenF1 API 연동 + 캐싱)
4. ✅ 서버 실행 및 API 엔드포인트 확인

#### 🟡 Phase 2: 데이터 변환 및 고급 기능 (부분 완료 - 2025.09.08)  
1. 🟡 추가 모듈 구현 (Drivers, Laps, Intervals) - **기본 구조 완료, 안정성 검증 필요**
2. ✅ 기본 데이터 변환 로직 (DRS, 세그먼트, DNF) - **완료**
3. 🟡 고급 모듈 구현 (CarData, RaceControl, Stints) - **기본 구조 완료, 테스트 필요**
4. 🟡 에러 처리 시스템 강화 (Circuit Breaker 패턴) - **Phase 3.0으로 이동**
5. 🟡 성능 최적화 (압축, 병렬 처리) - **Phase 3.2+로 이동**

#### 🚨 Phase 3.0: 기본 안정화 (즉시 필요)
1. 🔥 **서버 안정화 (최우선)**
   - 재시작 이슈 디버깅 및 해결
   - 메모리 누수 및 성능 문제 점검
   - 개발 환경 안정성 확보
2. 🧪 **API 완성도 검증**
   - 모든 43개 엔드포인트 기능 테스트
   - 비즈니스 로직 완성도 점검
   - OpenF1 API 연동 안정성 확인
3. 🛡️ **기본 에러 처리 완성**
   - 예외 상황 대응 강화
   - 사용자 친화적 에러 메시지
   - 로깅 시스템 개선
4. 🧪 **기본 테스트 추가**
   - 핵심 서비스 단위 테스트
   - API 엔드포인트 기본 테스트
   - 데이터 변환 로직 테스트

#### 🔮 Phase 3.1: 완성 및 최적화 (안정화 후)
1. 🟡 **Circuit Breaker 패턴 구현 (기본 완료, 통합 테스트 필요)**
   - CircuitBreakerService: 3상태 관리 (CLOSED/OPEN/HALF_OPEN) ✅
   - OpenF1ClientService에 통합: 검증 필요 🟡
   - Health 모듈: Circuit Breaker 상태 모니터링 API 제공 ✅
   - 실패 임계값 관리 및 자동 복구 로직 🟡
   - Fallback 데이터 반환으로 서비스 연속성 보장 (테스트 필요) 🟡
2. 🟡 **성능 최적화 (Phase 3.2+ 미구현, 안정화 후 진행)**
   - 데이터 압축 (gzip)
   - 병렬 처리 최적화
   - 텔레메트리 데이터 청킹
3. 🟡 **캐싱 전략 고도화 (Phase 3.3 미구현)**
   - 리플레이 캐싱 프로세스
   - 확장된 캐시 키 전략
4. 🟡 **모니터링 강화 (Phase 3.4 미구현)**
   - Winston 로거 고도화
   - 성능 메트릭 수집
5. 🟡 **보안 및 운영 (Phase 3.5 미구현)**
   - Rate Limiting
   - 보안 강화
6. 🟡 **종합 테스트 및 배포 준비 (Phase 3.6 미구현)**

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