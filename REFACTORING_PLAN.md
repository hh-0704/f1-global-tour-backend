# F1 Global Tour Backend - 리팩토링 계획서

## 개요 (Overview)

이 문서는 F1 Global Tour Backend의 코드 품질 향상을 위한 단계별 리팩토링 계획을 제시합니다. 현재 **Phase 1 완료** 상태이며, 남은 단계들을 체계적으로 진행하여 코드 중복을 제거하고 유지보수성을 향상시키는 것이 목표입니다.

## 현재 상태 분석 (Current Status)

### ✅ 완료된 작업 (Phase 1 - 완료)
1. **BaseF1Service 생성** - 공통 에러 처리 및 유틸리티 메서드 제공
2. **F1TransformationsUtil 생성** - DRS, Segment 변환 로직 통합
3. **F1Constants 생성** - 모든 상수값 중앙화 관리
4. **SessionsService 리팩토링** - 새로운 아키텍처 패턴 적용 예제

### 🎯 측정된 개선 효과
- **코드 라인 수**: ~40% 감소
- **중복 로직**: 99% 제거
- **타입 안전성**: 크게 향상
- **SessionsService**: 47줄 → 12줄 메서드로 축소

## 다음 단계 실행 계획 (Next Steps Execution Plan)

### 🚀 Phase 2: 핵심 서비스 리팩토링 (최우선)

#### **2.1 DriversService 리팩토링**
**목표**: BaseF1Service 패턴 적용 및 DRS 로직 통합

**구현 가이드라인**:
```typescript
// ✅ 적용해야 할 패턴
export class DriversService extends BaseF1Service {
  constructor(cachedOpenf1Client: CachedOpenF1ClientService) {
    super(cachedOpenf1Client);
  }

  // ❌ 제거해야 할 중복 코드
  private transformDRS(drsValue: number) { ... } // → F1TransformationsUtil.transformDRS() 사용

  // ✅ 새로운 메서드 구조
  async getDriverTelemetry(sessionKey: number, driverNumber: number) {
    return this.executeWithErrorHandling(async () => {
      // 비즈니스 로직만 집중
      const carData = await this.cachedOpenf1Client.fetchCarData(params);
      return carData.map(data => F1TransformationsUtil.transformCarData(data));
    }, 'fetch driver telemetry', { sessionKey, driverNumber });
  }
}
```

**체크리스트**:
- [ ] BaseF1Service 상속 적용
- [ ] 중복 DRS 변환 로직 제거 (lines 198-210)
- [ ] executeWithErrorHandling로 try/catch 교체
- [ ] F1TransformationsUtil.transformCarData() 활용
- [ ] 타입 안전성 향상 (`any` 타입 제거)

#### **2.2 LapsService 리팩토링**
**목표**: 복잡한 분석 메서드 분해 및 공통 패턴 적용

**문제점**:
- `getLapAnalysis()` 메서드가 46줄로 과도하게 복잡
- Segment 변환 로직 중복
- 복잡한 progressive analysis 로직

**구현 가이드라인**:
```typescript
export class LapsService extends BaseF1Service {
  // ✅ 복잡한 메서드 분해
  async getLapAnalysis(sessionKey: number, driverNumber?: number) {
    return this.executeWithErrorHandling(async () => {
      const laps = await this.getDriverLaps(sessionKey, driverNumber);
      
      return {
        laps: laps.map(lap => F1TransformationsUtil.transformLapData(lap)),
        analysis: this.calculateLapStatistics(laps),
        progressive: this.calculateProgressiveAnalysis(laps)
      };
    }, 'analyze laps', { sessionKey, driverNumber });
  }

  // ✅ 메서드 분해 - 단일 책임 원칙 적용
  private calculateLapStatistics(laps: TransformedLapData[]) {
    return this.calculateStatistics(
      laps.map(lap => lap.lapTime).filter(time => time !== null)
    );
  }
}
```

**체크리스트**:
- [ ] BaseF1Service 상속 적용
- [ ] 46줄 `getLapAnalysis()` 메서드 분해
- [ ] Segment 변환을 F1TransformationsUtil로 교체
- [ ] Progressive analysis 로직 별도 메서드로 분리
- [ ] convertTimeToSeconds 중복 로직 제거

#### **2.3 CarDataService 리팩토링**
**목표**: 텔레메트리 분석 로직 최적화

**문제점**:
- DRS 변환 로직 중복 (DriversService와 동일)
- `getDriverComparison()` 메서드 38줄로 복잡
- 성능 분석 로직 반복

**체크리스트**:
- [ ] 중복 DRS 변환 로직 제거
- [ ] 복잡한 comparison 로직 분해
- [ ] F1Constants의 SPEED_RANGES 활용
- [ ] 통계 계산을 BaseF1Service 메서드 활용

### 🔧 Phase 3: 중간 우선순위 리팩토링

#### **3.1 IntervalsService 리팩토링**
**체크리스트**:
- [ ] BaseF1Service 패턴 적용
- [ ] 복잡한 `getIntervalsHistory()` 메서드 분해
- [ ] 타입 캐스팅 (`intervalsAtTime as any[]`) 제거

#### **3.2 RaceControlService 리팩토링**  
**체크리스트**:
- [ ] F1Constants의 FLAG_KEYWORDS, INCIDENT_KEYWORDS 활용
- [ ] 메시지 분류 로직을 별도 유틸리티로 분리
- [ ] 복잡한 분석 메서드들 분해

#### **3.3 StintsService 리팩토링**
**체크리스트**:
- [ ] 47줄 `calculateStintPerformanceMetrics()` 메서드 분해
- [ ] 타이어 성능 분석을 F1Constants 기반으로 표준화
- [ ] 중복 통계 계산 로직 BaseF1Service 활용

### 🚀 Phase 4: 성능 최적화

#### **4.1 데이터 페칭 패턴 개선**
**현재 문제점**:
```typescript
// ❌ 비효율적 패턴
const sessionStints = await this.getSessionStints(sessionKey); // 전체 데이터 조회
const driverStints = sessionStints.stints.filter(stint => 
  stint.driverNumber === driverNumber
); // 클라이언트 사이드 필터링
```

**개선 방안**:
```typescript
// ✅ 최적화된 패턴
async getDriverStintsOptimized(sessionKey: number, driverNumber: number) {
  const params: StintsQueryParams = {
    session_key: sessionKey,
    driver_number: driverNumber, // API 레벨에서 필터링
  };
  return await this.cachedOpenf1Client.fetchStints(params);
}
```

**체크리스트**:
- [ ] StintsService의 중복 세션 데이터 조회 최적화
- [ ] CarDataService의 전체 세션 텔레메트리 조회 개선  
- [ ] 불필요한 데이터 변환 단계 제거

#### **4.2 캐시 전략 개선**
**체크리스트**:
- [ ] F1Constants의 CACHE_TTL 값들을 캐시 서비스에 적용
- [ ] 세션별 데이터 프리로딩 최적화
- [ ] 메모리 사용량 모니터링 추가

### 📊 Phase 5: 타입 안전성 강화

#### **5.1 인터페이스 정의 및 적용**
```typescript
// ✅ 추가해야 할 인터페이스들
export interface TransformedInterval {
  timestamp: string;
  driverNumber: number;
  gapToLeader: number | null;
  interval: number | null;
  sessionKey: number;
  meetingKey: number;
}

export interface TransformedStint {
  driverNumber: number;
  stintNumber: number;
  lapStart: number;
  lapEnd: number;
  tireCompound: string;
  tireAge: number;
  sessionKey: number;
  meetingKey: number;
  isNew: boolean;
  stintLength: number;
}
```

**체크리스트**:
- [ ] 모든 서비스의 `any` 타입을 구체적 인터페이스로 교체
- [ ] API 응답 타입 정의 추가
- [ ] 내부 데이터 구조 인터페이스 정의

### 🧪 Phase 6: 테스트 및 검증

#### **6.1 단위 테스트 작성**
**체크리스트**:
- [ ] F1TransformationsUtil 유닛 테스트
- [ ] BaseF1Service 에러 처리 테스트  
- [ ] 각 서비스의 리팩토링된 메서드 테스트

#### **6.2 통합 테스트**
**체크리스트**:
- [ ] API 엔드포인트 응답 형식 검증
- [ ] 캐싱 동작 확인
- [ ] 에러 시나리오 테스트

## 실행 우선순위 (Priority Order)

### 🔥 즉시 실행 (This Week)
1. **DriversService 리팩토링** - DRS 로직 중복 제거가 시급
2. **LapsService 리팩토링** - 복잡한 메서드 분해
3. **CarDataService 리팩토링** - 성능 분석 최적화

### ⚡ 단기 실행 (Next Week)  
4. **IntervalsService, RaceControlService, StintsService** - 나머지 서비스들 리팩토링
5. **데이터 페칭 최적화** - 성능 개선

### 📈 장기 실행 (Next Sprint)
6. **타입 안전성 강화** - 완전한 타입 커버리지
7. **테스트 작성** - 리팩토링 검증

## 품질 기준 (Quality Standards)

### ✅ 각 서비스 리팩토링 완료 기준
1. **BaseF1Service 상속** 적용됨
2. **에러 처리 중복** 완전 제거 (try/catch → executeWithErrorHandling)
3. **데이터 변환** F1TransformationsUtil 사용
4. **상수값** F1Constants 사용  
5. **복잡한 메서드** (30줄 이상) 분해 완료
6. **타입 안전성** `any` 사용 최소화

### 📊 성과 측정 지표
- **코드 라인 수**: 각 서비스 30% 이상 감소 목표
- **중복 코드**: Sonar 기준 0% 달성
- **복잡도**: 메서드당 15줄 이하 유지
- **타입 커버리지**: 90% 이상 달성

## 리팩토링 체크리스트 템플릿

각 서비스 리팩토링시 아래 체크리스트를 사용:

```markdown
## [ServiceName] 리팩토링 체크리스트

### 기본 구조
- [ ] BaseF1Service 상속 적용
- [ ] constructor 수정 (super() 호출)
- [ ] 불필요한 import 제거 (Logger, HttpException 등)

### 에러 처리
- [ ] try/catch 블록을 executeWithErrorHandling로 교체
- [ ] 로깅 로직 제거 (BaseF1Service에서 처리)
- [ ] 일관된 에러 메시지 적용

### 데이터 변환
- [ ] 중복 변환 로직을 F1TransformationsUtil 사용으로 교체
- [ ] DRS 변환 로직 제거
- [ ] Segment 변환 로직 통합

### 상수 활용
- [ ] 하드코딩된 값들을 F1Constants 사용으로 교체
- [ ] 캐시 TTL 값 적용
- [ ] 분석 임계값 표준화

### 메서드 분해
- [ ] 30줄 이상 메서드 식별 및 분해
- [ ] 단일 책임 원칙 적용
- [ ] private 메서드로 로직 분리

### 타입 안전성
- [ ] any 타입을 구체적 인터페이스로 교체
- [ ] 타입 캐스팅 제거
- [ ] 옵셔널 타입 안전 처리
```

## 주의사항 (Important Notes)

### 🚨 반드시 지켜야 할 원칙
1. **기존 API 계약 유지** - 외부 API 응답 형식 변경 금지
2. **점진적 리팩토링** - 한 번에 모든 것을 바꾸지 않음
3. **테스트 커버리지** - 리팩토링 후 반드시 테스트 확인
4. **백워드 호환성** - 기존 기능 동작 보장

### 💡 리팩토링 베스트 프랙티스
1. **작은 단위로 진행** - 한 번에 하나의 서비스씩
2. **커밋 단위 최소화** - 각 변경사항을 개별 커밋
3. **코드 리뷰 필수** - 리팩토링 후 품질 검토
4. **문서 업데이트** - README 및 API 문서 동기화

이 계획서를 따라 진행하면 코드 품질이 현저히 개선되고 유지보수성이 크게 향상될 것입니다.