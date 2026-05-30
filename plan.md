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

### (B) 가공 결과 — 무거운 계산 결과 (재계산 방지)
- `driver_timings` 프레임 (`DriverDisplayFrame[]`)
- `race_flags` 결과

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

## 7. 작업 단계 (Tasks)

### 1단계 — RDB 영구 저장 (429 해결 핵심)
- [ ] 의존성 추가: `prisma`(dev), `@prisma/client`
- [ ] `docker-compose.yml` 작성 (로컬 Postgres)
- [ ] `.env.example` 갱신 (`DATABASE_URL` 등)
- [ ] `prisma/schema.prisma` 작성 (위 스키마, jsonb 통째 + logic_version)
- [ ] `prisma migrate dev` 로 초기 마이그레이션 생성
- [ ] `PrismaModule` / `PrismaService` 작성 (NestJS 연동, onModuleInit connect)
- [ ] `package.json` scripts 보강: `postinstall: prisma generate`, build 전 generate (규칙 ⑤)
- [ ] Repository(또는 Prisma 직접 호출) 레이어: 저장/조회
- [ ] `CachedOpenF1ClientService`를 **진짜 캐시 레이어로 승격** (원본 한정, 규칙 ③)
      → `fetchLaps/Intervals/Drivers/Stints/RaceControl`에 "RDB 조회 → 없으면 OpenF1 호출 후 RDB 저장" 폴백
      → **빈 결과 `[]` 는 저장 금지** (규칙 ①)
      → 저장은 session_key 전체 단위, `lapNumber` 등 필터는 메모리 적용 (규칙 ②)
      → `fetchSessions`(목록)는 캐싱 제외 (직통 유지)
- [ ] "끝난 세션" 가드: 세션 메타 먼저 확보 후 `date_end < now()` 일 때만 영구 저장 (규칙 ④)
- [ ] `driver_timings` / `race_flags` 가공 결과 DB 저장 연동 — `SessionsService`/`RaceFlagsService` 수정, `logic_version` 체크 포함 (규칙 ③)
- [ ] 기존 인메모리 `framesCache` Map / RaceFlags 캐시 제거 → DB로 대체
- [ ] 워밍업 엔드포인트(`POST /start-replay`) 강화: **동기**로 원본+프레임 계산·저장
- [ ] 테스트: `PrismaService` mock 주입, 캐시 레이어 hit/miss·빈결과 가드 테스트 추가 (규칙 ⑤)

### 2단계 — Redis 핫 캐시
- [ ] 의존성 추가: `@nestjs/cache-manager`, redis store
- [ ] `docker-compose.yml`에 Redis 추가
- [ ] 캐시 레이어에 Redis "조회 → miss 시 RDB" 단계 삽입
- [ ] 무거운 프레임 JSON Redis 적재 (적절한 TTL 또는 무기한)
- [ ] 테스트

## 8. 마이그레이션 리스크 / 주의

- 현재 DB 의존성 0 → 초기 인프라 셋업 비용 있음 (docker-compose, 연결, 마이그레이션)
- 서비스 로직은 `CachedOpenF1ClientService` 레이어 덕에 거의 무수정 가능
- 회로차단기/재시도 로직은 **유지** (최초 워밍업 시 OpenF1 호출엔 여전히 필요)
- CLAUDE.md 갱신 필요 ("CachedOpenF1ClientService는 pass-through" 설명이 더 이상 사실 아님)

## 9. 완료 기준 (Definition of Done)

- [ ] 동일 세션을 반복 요청해도 OpenF1 호출 로그가 최초 1회만 찍힘
- [ ] 서버 재시작 후에도 DB에서 즉시 응답 (OpenF1 미호출)
- [ ] 429 에러 미발생
- [ ] 기존 API 응답 형식 동일 (프론트 영향 없음)
- [ ] 테스트 통과
