# 작업 계획: OpenF1 직접 호출 → DB 영구 저장 전환

> 임시 작업 문서. 작업 완료 후 삭제 또는 `docs/`로 이관.
> 작성일: 2026-05-30

## 1. 배경 / 문제

현재 백엔드는 모든 요청마다 외부 [OpenF1 API](https://api.openf1.org/v1)를 직접 호출한다.
이로 인해 **429 (Too Many Requests)** 에러가 빈번하게 발생한다.

### 현재 구조
```
Controller → Service → CachedOpenF1ClientService → OpenF1ClientService → CircuitBreakerService → axios
```

- `CachedOpenF1ClientService`: 이름과 달리 **실제 캐싱 없음** (pass-through wrapper)
- 유일한 캐싱: `SessionsService.framesCache` / `RaceFlagsService` 의 **인메모리 Map (10분 TTL)**
- 한계:
  1. 서버 재시작 시 캐시 전부 소실 → OpenF1 재폭격
  2. 10분 TTL 만료 시 **불변 데이터까지** 재요청
  3. 다중 인스턴스 환경에서 캐시 공유 불가

### 현재의 429 완화 장치 (불충분)
- `fetchWithRetry`: 429 시 최대 3회 재시도 (2s/4s/6s 백오프)
- `CircuitBreakerService`: 5회 실패 시 OPEN, 30초 후 HALF_OPEN

## 2. 핵심 통찰

**과거(끝난) 세션의 OpenF1 데이터는 절대 변하지 않는다 (immutable).**

이번 작업 범위는 **과거 리플레이 전용** (라이브 세션 미지원)으로 확정.
→ 모든 대상 데이터가 불변이므로 다음 목표가 성립한다:

> **세션당 OpenF1 호출은 최초 1회(워밍업), 이후 영구히 0회.**

이 목표를 달성하면 429는 구조적으로 사라진다.

## 3. 결정 사항 (Decisions)

| 항목 | 결정 | 비고 |
|------|------|------|
| 저장소 | **RDB + Redis 둘 다** | RDB = 영구 원본(source of truth), Redis = 핫 캐시 |
| RDB | **PostgreSQL** | jsonb 지원, 영구 저장소 |
| ORM | **Prisma** | `prisma` + `@prisma/client`. 마이그레이션은 `prisma migrate` |
| Redis 클라이언트 | `@nestjs/cache-manager` + redis store (또는 ioredis) | 2단계에서 도입 |
| 대상 범위 | **과거 리플레이 전용** | 라이브 세션 제외 |
| 진행 순서 | **1단계 RDB 먼저 → 2단계 Redis 추가** | RDB만으로도 429 해결됨. Redis는 응답 지연/DB 부하 최적화 |
| 원본 저장 형태 | **JSON(jsonb) 통째 저장** | session_key 단위로 OpenF1 응답 배열을 jsonb 하나로. 조회 단순 |
| 로컬 DB 환경 | **docker-compose 신규** | 레포에 추가, 추후 Redis도 동일 compose에 |
| 가공 결과 무효화 | **스키마 버전 컬럼 (`logic_version`)** | 코드 버전과 다르면 자동 재계산 |
| 세션 목록(`GET /sessions`) 캐싱 | **캐싱 안 함** | 가볍고 429 주범 아님. OpenF1 직통 유지 |
| 워밍업(`start-replay`) | **동기** | 원본+프레임 다 저장 후 응답. 최초 1회 수십 초 가능 |

## 4. 목표 아키텍처

```
요청 → Service → ① Redis 조회 (hit → 즉시 반환)
                  ↓ miss
                ② RDB 조회 (hit → Redis 적재 후 반환)
                  ↓ miss
                ③ OpenF1 호출 → RDB 영구 저장 → Redis 적재 → 반환
```

- **RDB**: 영구 저장. 끝난 세션은 TTL 없음 (한 번 저장하면 재호출 안 함)
- **Redis**: 핫 캐시. 무거운 `DriverDisplayFrame[]` JSON 통째 저장. 자주 보는 세션 가속

### "끝난 세션" 판정
과거 전용이므로 단순: `session.date_end < now()`.
워밍업 시점에 이 조건이면 영구 저장 플래그 ON.

## 5. 저장 대상

### (A) 원본 데이터 — OpenF1 raw 응답
- `sessions`
- `laps`
- `intervals`
- `drivers`
- `stints`
- `race_control`
- `location` (드라이버 단위, 대용량 — §6.6)

### (B) 가공 결과 — 무거운 계산 결과 (재계산 방지)
- `driver_timings` 프레임 (`DriverDisplayFrame[]`)
- `race_flags` 결과
- `positions` 결과 (`PositionsResponse`, `{t,lng,lat}` 시계열 — §6.6)
- `raceStart` (보조, 불변 — §6.6)

## 6. 테이블 스키마 (초안)

```
openf1_sessions       (session_key PK, raw jsonb, date_end, is_final, fetched_at)
openf1_laps           (session_key, raw jsonb, fetched_at)   -- 세션 단위 묶음 저장
openf1_intervals      (session_key, raw jsonb, fetched_at)
openf1_drivers        (session_key, raw jsonb, fetched_at)
openf1_stints         (session_key, raw jsonb, fetched_at)
openf1_race_control   (session_key, raw jsonb, fetched_at)
driver_timings_cache  (session_key PK, frames jsonb, logic_version int, computed_at)
race_flags_cache      (session_key PK, result jsonb, logic_version int, computed_at)
```

> 초기엔 `jsonb` 통째 저장으로 단순하게 시작. 추후 분석/쿼리 필요 시 정규화 검토.

### 가공 결과 무효화 (`logic_version`)
- 코드에 상수 `DRIVER_TIMINGS_LOGIC_VERSION`, `RACE_FLAGS_LOGIC_VERSION` 정의
- 캐시 조회 시 `저장된 logic_version === 코드 상수` 일 때만 hit 처리
- 계산 로직을 바꿀 때마다 상수를 +1 → 기존 캐시 자동 무효화 후 재계산
- 원본(openf1_*)은 불변이므로 무효화 대상 아님 (재계산 시 OpenF1 재호출 불필요)

## 6.5 1단계 구현 세부 규칙 (구현 시 반드시 준수)

코드와 대조하며 도출한, 구현 중 빠지기 쉬운 함정과 규칙.

### ① 빈 결과/에러 결과는 절대 영구 저장 금지 ⚠️ (최우선)
- 현재 `OpenF1ClientService`는 회로차단기 OPEN/실패 시 **빈 배열 `[]`을 fallback** 반환
  (`openf1-client.service.ts` 의 `circuitBreaker.execute(fn, [])`)
- 이 `[]`를 정상 캐시로 저장하면 해당 세션이 **영구히 빈 데이터**가 됨
- **규칙**: 캐시에는 `length > 0` 인 성공 응답만 저장. 빈 결과는 저장하지 않고 그대로 반환

### ② `lapNumber` 등 부분 필터는 "전체 저장 + 메모리 필터"
- `LapsService` 는 `?lapNumber=X` 로 특정 랩만 요청 가능 (`laps.service.ts`)
- 캐시 레이어는 **항상 session_key 전체**를 저장/조회하고, `lap_number` 필터는
  조회 후 **메모리에서** 적용 (파라미터별 분할 저장 금지 — 캐시 효율 저하)

### ③ 레이어별 수정 범위 (원본 vs 가공)
- **원본 캐싱** (`laps/intervals/drivers/stints/race_control`)
  → `CachedOpenF1ClientService` 내부에서만 처리. **서비스 비즈니스 로직 무수정**
- **가공 결과 캐싱** (`DriverDisplayFrame[]`, race_flags 결과)
  → `SessionsService.framesCache` / `RaceFlagsService` 캐시는 DB 연동으로 **반드시 수정**
- 즉 "무수정"은 원본 한정. 가공 결과 서비스는 수정 대상임

### ④ "끝난 세션" 가드 + 조회 순서 의존성
- 영구 저장은 `session.date_end < now()` 인 세션만 (과거 전용 가드)
- laps 등을 저장하려면 먼저 해당 세션 메타가 필요 → **세션 정보를 먼저 확보**
- 워밍업 진입 시 세션 메타 조회 → final 판정 → 원본/프레임 저장 순서

### ⑤ Prisma 운영 디테일
- `package.json` 에 `postinstall: prisma generate`, `build` 전 generate 보장
- `prisma/migrations/` 디렉터리는 **커밋**
- 테스트(jest): `PrismaService` 는 **mock**으로 주입 (단위 테스트가 실 DB에 의존하지 않게).
  기존 spec들은 `CachedOpenF1ClientService` 를 mock하므로 영향 적음. 캐시 레이어 자체 테스트만 Prisma mock 추가
- `.gitignore` 에 생성물 점검 (`@prisma/client` 는 node_modules)

## 6.6 positions / location 캐싱 통합 (리플레이 위치 정확도) — replay-implementation-plan.md 이관

> 별도 작업으로 **positions 파이프라인은 구현 완료**(calibration/race-time/positions 모듈,
> `GET /sessions/:sk/positions` → 드라이버별 `{t,lng,lat}` 시계열). 현재는 **인메모리 캐시 + single-flight**.
> 본 RDB+Redis 전환에 positions 결과와 raw location 캐싱을 함께 얹는다(같은 3단 폴백·규칙 적용).

### 추가 저장 대상
- **(A) 원본 추가 — OpenF1 `/location`**: **드라이버 단위**로 저장(세션·드라이버당 수만 행, 매우 큼).
  - 키 `raw:location:{sk}:{driver}`. 레이스 date 윈도우 청크 페이징(`fetchLocationWindow`)으로 수집.
  - **빈 결과 `[]` 저장 금지(규칙 ①)** — 피트인/수집실패로 일시적으로 비었을 수 있어 영구 결손 방지.
- **(B) 가공 추가 — `positions` 결과(`PositionsResponse`)**: 무겁고 불변 → jsonb 영구저장 + Redis 핫캐시.
  - 키 `positions:{sk}`, `logic_version = POSITIONS_LOGIC_VERSION`
    (좌표 계수·도로스냅·다운샘플 등 파이프라인 로직 변경 시 +1 → 자동 재계산).
- **보조 — `raceStart:{sk}`**: 레이스 시작 절대 ms(불변, race-time 단일 기준). 가벼우나 캐시 가치 있음.

### 추가 테이블 스키마(초안)
```
openf1_location   (session_key, driver_number, raw jsonb, fetched_at)   -- (sk, driver) 단위
positions_cache   (session_key PK, result jsonb, logic_version int, computed_at)
race_start_cache  (session_key PK, race_start_ms bigint, computed_at)   -- 또는 openf1_sessions 메타 컬럼
```

### 캐시 레이어 통합 지점 (현재 인메모리 → RDB+Redis 치환)
- `CachedOpenF1ClientService.fetchLocation` (현재 패스스루) → location raw 3단 폴백(Redis→RDB→OpenF1), **빈 결과 저장 금지**, 드라이버 단위 저장.
- `PositionsService` (현재 인메모리 Map + single-flight) → `positions:{sk}` RDB jsonb + Redis, `logic_version` 체크.
- `RaceTimeService` (현재 인메모리 Map) → `raceStart:{sk}` 캐시.
- `start-replay` 프리워밍이 이미 positions 백그라운드 빌드를 호출 → RDB 적재로 자연 영구화.

### positions 응답 크기 주의 (성능)
- 측정(20드라이버, ~5분 데이터): **990KB 비압축 / 292KB gzip**, 다운샘플 818/1177(69%).
- **풀레이스(~90분)는 ~18배** → gzip 수 MB 가능. RDB jsonb 컬럼 크기·Redis 메모리 고려.
- 최적화 여지: `DOWNSAMPLE_HZ`↓, 레이스 윈도우 축소(현재 `session.date_end`/+3h 상한 → 실 종료시각으로).

## 7. 작업 단계 (Tasks)

### 1단계 — RDB 영구 저장 (429 해결 핵심) ✅ 완료
- [x] 의존성 추가: `prisma`(dev), `@prisma/client` (Prisma 7 → driver-adapter 요구로 **6.x 채택**)
- [x] `docker-compose.yml` 작성 (로컬 Postgres 16)
- [x] `.env.example` 갱신 (`DATABASE_URL` 등) — 기존 placeholder 유지, `.env` 생성
- [x] `prisma/schema.prisma` 작성 (위 스키마, jsonb 통째 + logic_version)
- [x] `prisma migrate dev` 로 초기 마이그레이션 생성 (`20260603123716_init`)
- [x] `PrismaModule`(@Global) / `PrismaService` 작성 (onModuleInit connect)
- [x] `package.json` scripts 보강: `postinstall: prisma generate`, build 전 generate (규칙 ⑤)
- [x] Prisma 직접 호출 레이어: 저장/조회 (`CachedOpenF1ClientService` 내부)
- [x] `CachedOpenF1ClientService`를 **진짜 캐시 레이어로 승격** (원본 한정, 규칙 ③)
      → `fetchLaps/Intervals/Drivers/Stints/RaceControl` RDB 폴백 (`cachedSessionRaw` 헬퍼)
      → **빈 결과 `[]` 저장 금지** (규칙 ①) / session_key 전체 저장·필터는 메모리 (규칙 ②)
      → `fetchSessions`(목록)는 캐싱 제외 (직통 유지)
- [x] "끝난 세션" 가드: `ensureSessionMeta`/`isSessionFinal` → `date_end < now` 일 때만 저장 (규칙 ④)
- [x] `driver_timings` / `race_flags` 가공 결과 DB 저장 연동 — `BaseF1Service.getCachedComputed`,
      `logic_version` 체크 (`src/common/constants/logic-version.ts`)
- [x] 기존 인메모리 `framesCache` / RaceFlags / Positions / RaceTime Map 제거 → DB로 대체
- [x] 워밍업(`POST /start-replay`) 강화: **동기**로 원본 + `driver_timings` 프레임 계산·저장
      (positions 프리워밍은 백그라운드 — §6.6)
- [x] **positions/location 통합 (§6.6)**: `fetchLocation` 드라이버 단위 캐싱(빈결과 가드),
      `positions_cache`+`PositionsService`, `race_start_cache`+`RaceTimeService` (`POSITIONS_LOGIC_VERSION`)
- [x] 테스트: `PrismaService` mock 주입, 캐시 레이어 hit/miss·빈결과·끝난세션·메모리필터 테스트 (규칙 ⑤)

### 2단계 — HTTP immutable 캐시 ✅ 완료 (Redis는 보류)

> **결정 변경**: 당초 2단계는 "Redis 핫 캐시"였으나, 불변 데이터 특성을 재검토해 **HTTP immutable 캐시**로 전환.
>
> 근거: 무거운 엔드포인트(`driver-timings`/`positions`) 응답 1건의 비용은 ① 저장소 조회 → ② `JSON.parse` →
> ③ 응답 `JSON.stringify` → ④ gzip 인데, **②③④는 RDB든 Redis든 동일**하고 Redis가 줄이는 건 ①뿐(수 MB에서 ~10–30ms).
> 반면 불변 데이터에 가장 큰 레버리지는 **재시청·스크럽 시 요청이 서버에 아예 도달하지 않게** 하는 것 → `Cache-Control: immutable`.
> 인프라 추가도 없다. Redis는 동시성 하 PG CPU 보호용으로 **나중에 필요해지면** 도입(아래 보류 항목).

- [x] `ImmutableCacheInterceptor` + `@ImmutableCache({ tag, version?, maxAge? })` 데코레이터
      (`src/common/interceptors/immutable-cache.interceptor.ts`), 전역 `APP_INTERCEPTOR` 등록.
- [x] 끝난 세션(`isSessionFinal`)일 때만 `Cache-Control: public, max-age, immutable` + 결정적 ETag.
      진행 중/미확정 세션은 `no-store`(불변 보장 불가).
- [x] ETag = `W/"{tag}-v{logic_version}-{originalUrl}"` — logic_version 포함(로직 변경 시 자연 무효화),
      URL 포함(laps 의 `driverNumber/lapNumber` 쿼리까지 고유). 본문 해시 없이 Express 조건부 GET(304) 활용.
- [x] 적용: `drivers`(원본·1년), `laps`(원본·1년), `driver-timings`/`race-flags`/`positions`(가공·1일, logic_version).
- [x] 테스트(`immutable-cache.interceptor.spec.ts`): 메타 없음 패스스루 / 끝난 세션 헤더·ETag / 미확정 no-store /
      maxAge·쿼리 반영 ETag / sessionKey 없음 패스스루.

#### 보류 — Redis 핫 캐시 (필요 시 재개)
- [ ] 동시성/부하가 실제로 PG CPU를 압박하면 도입: 캐시 레이어(`cachedSessionRaw`/`getCachedComputed`) 앞단에
      Redis 3단 폴백 삽입(`@Optional` 주입으로 graceful degradation). docker-compose Redis 추가.

## 8. 마이그레이션 리스크 / 주의

- 현재 DB 의존성 0 → 초기 인프라 셋업 비용 있음 (docker-compose, 연결, 마이그레이션)
- 서비스 로직은 `CachedOpenF1ClientService` 레이어 덕에 거의 무수정 가능
- 회로차단기/재시도 로직은 **유지** (최초 워밍업 시 OpenF1 호출엔 여전히 필요)
- CLAUDE.md 갱신 필요 ("CachedOpenF1ClientService는 pass-through" 설명이 더 이상 사실 아님)

## 9. 완료 기준 (Definition of Done)

> 라이브 검증 완료 (2026-06-05, 끝난 세션 `7953` 콜드→웜→재시작 시나리오).

- [x] 동일 세션을 반복 요청해도 OpenF1 호출 로그가 최초 1회만 찍힘
      — drivers 반복 요청·304 포함 누적 1회 고정, driver-timings 웜 재요청 시 laps/intervals/stints 증가 0
- [x] 서버 재시작 후에도 DB에서 즉시 응답 (OpenF1 미호출)
      — 재시작 후 OpenF1 호출 0회로 동일 데이터 200 반환(0.011s)
- [x] 429 에러 미발생 (구조적 충족)
      — 반복 요청이 OpenF1 에 도달하지 않음(워밍업 1회만 외부 호출). 회로차단기+429 재시도는 백스톱 유지.
        ⚠ 대량 동시부하 테스트는 미수행 — 메커니즘상 429 원인은 제거됨
- [x] 기존 API 응답 형식 동일 (프론트 영향 없음)
      — 콜드↔웜 응답 바이트 크기 동일(drivers 5807B, driver-timings 15,426,299B)
- [x] 테스트 통과 — `npm run test`: 194 passed / 16 suites

## 10. 로컬 실행 / 배포 가이드 (DB)

### 10.1 로컬 DB 띄우기
`docker-compose.yml` 에 Postgres 16 이 정의되어 있다(현재 compose 는 postgres 단일 서비스).

```bash
docker compose up -d        # postgres 백그라운드 기동 (5432)
docker compose ps           # STATUS = healthy 확인
docker compose down         # 컨테이너만 제거 (데이터 볼륨 유지)
docker compose down -v      # 데이터 볼륨까지 삭제 (완전 초기화)
```

- 데이터는 **Docker 명명 볼륨 `f1-postgres-data`** 에 저장(컨테이너 삭제해도 유지). repo 안에는 없음.
- 계정/DB 는 `user` / `password` / `f1db` 고정 → `.env` 의 `DATABASE_URL=postgresql://user:password@localhost:5432/f1db` 와 일치.

### 10.2 DB 셋팅 (테이블 생성)
스키마는 `prisma/schema.prisma`, 초기 마이그레이션 `20260603123716_init` 이 **git 에 커밋됨**. 셋팅 = 빈 DB 에 테이블 생성.

```bash
npx prisma migrate dev      # 마이그레이션 적용 + Prisma Client 생성 (최초 1회/초기화 후)
npx prisma studio           # GUI 로 테이블·데이터 확인 (localhost:5555)
npm run start:dev           # 서버 기동 (4000)
```

- 처음엔 모든 테이블이 **비어 있음**. 세션 조회/`POST /sessions/:sk/start-replay` 시 OpenF1 에서 받아와 DB 에 영구 저장(1단계 설계). 이후 OpenF1 재호출 없음.
- `prisma generate` 는 `postinstall`·`build` 에 묶여 자동 실행.

### 10.3 배포 시 "다운로드한 DB 데이터"는 함께 올라가지 않는다 ⚠️
**코드 배포와 DB 는 완전히 별개.** 배포 산출물에는 **테이블 구조만** 들어가고 **데이터(캐시된 OpenF1 응답)는 안 들어간다.**

| 항목 | 배포에 포함 | 비고 |
|---|---|---|
| 앱 코드 / `prisma/schema.prisma` | ✅ | 소스·스키마 정의 |
| `prisma/migrations/` | ✅ | 테이블 **구조(빈 껍데기)** 정의. 데이터 아님 |
| `.env` | ❌ | gitignore. 서버는 별도 환경변수로 주입 |
| 캐시된 OpenF1 데이터(랩/포지션 등) | ❌ | **로컬 Postgres 볼륨에만** 존재. git·dist 어디에도 없음 |

**서버 배포 흐름:**
1. 서버에 **별도 Postgres** 준비(관리형 DB Railway/Supabase/RDS 또는 서버 docker).
2. 서버 환경변수 `DATABASE_URL` 을 그 DB 로 설정.
3. 배포 시 **`npx prisma migrate deploy`** 실행 → 빈 테이블 생성(프로덕션용, 프롬프트·리셋 없음. `migrate dev` 아님).
4. 서버 DB 는 비어서 시작 → 요청이 오면 OpenF1 에서 받아와 **서버 DB 가 스스로 충전**(불변 데이터라 세션당 최초 1회). 데이터를 손으로 옮길 필요 없음.

**(선택) 로컬 데이터를 서버로 미리 옮겨 워밍업 비용을 아끼려면** — 배포와 무관한 수동 작업:
```bash
docker compose exec postgres pg_dump -U user f1db > f1db.sql   # 로컬 덤프
psql "<서버_DATABASE_URL>" < f1db.sql                          # 서버 DB 에 복원
```
