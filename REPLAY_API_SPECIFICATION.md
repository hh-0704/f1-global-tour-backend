# F1 Replay API Specification

F1 Global Tour 리플레이 모드의 백엔드 API 명세서입니다. 현재 구현된 엔드포인트만 기술합니다.

## 목차
- [개요](#개요)
- [공통 응답 형식](#공통-응답-형식)
- [세션 관리 API](#세션-관리-api)
- [레이스 플래그 API](#레이스-플래그-api)
- [랩 데이터 API](#랩-데이터-api)
- [헬스체크 API](#헬스체크-api)
- [데이터 모델](#데이터-모델)
- [데이터 변환 로직](#데이터-변환-로직)
- [에러 처리](#에러-처리)
- [OpenF1 연동 특이사항](#openf1-연동-특이사항)

---

## 개요

NestJS 기반 백엔드로, OpenF1 API(`https://api.openf1.org/v1`)를 프록시하여 프론트엔드에 전달합니다.

**구현된 기능:**
- OpenF1 API 호출 + 데이터 변환
- Circuit Breaker (5회 실패 → OPEN, 30초 후 복구 시도)
- 429 Rate Limit 자동 재시도 (최대 3회, 2s/4s/6s 지수 백오프)
- `driver-timings` 결과 인메모리 캐싱 (Map, 10분 TTL)

**미구현 (계획에만 존재):**
- Redis 캐싱 (`CachedOpenF1ClientService`는 현재 pass-through)
- WebSocket / 실시간 스트리밍
- Drivers / Intervals / Car-data / Race-control / Stints 별도 모듈

---

## 공통 응답 형식

### 성공 응답
```json
{
  "success": true,
  "data": {},
  "timestamp": "2024-03-15T10:30:00.000Z"
}
```

### 에러 응답
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message"
  },
  "timestamp": "2024-03-15T10:30:00.000Z"
}
```

---

## 세션 관리 API

### 1. 세션 목록 조회

```
GET /api/v1/sessions
```

**Query Parameters**:
| 파라미터 | 필수 | 설명 | 예시 |
|---------|------|------|------|
| `country` | 선택 | 국가명 필터 | `Belgium`, `Japan` |
| `year` | 선택 | 연도 필터 | `2023`, `2024` |

**응답 `data`**: OpenF1 세션 원본 배열 (변환 없음)

```json
{
  "success": true,
  "data": [
    {
      "meeting_key": 1216,
      "session_key": 9134,
      "session_name": "Race",
      "session_type": "Race",
      "location": "Spa-Francorchamps",
      "country_name": "Belgium",
      "country_code": "BEL",
      "date_start": "2023-07-30T13:00:00+00:00",
      "date_end": "2023-07-30T15:00:00+00:00",
      "year": 2023
    }
  ],
  "timestamp": "2024-03-15T10:30:00.000Z"
}
```

---

### 2. 세션 드라이버 조회

```
GET /api/v1/sessions/:sessionKey/drivers
```

**응답 `data`**: `TransformedDriver[]` — OpenF1 드라이버 데이터를 camelCase로 변환

```json
{
  "success": true,
  "data": [
    {
      "number": 1,
      "name": "VER",
      "fullName": "Max VERSTAPPEN",
      "team": "Red Bull Racing",
      "teamColor": "3671C6",
      "countryCode": "NED",
      "headShotUrl": "https://...",
      "sessionKey": 9158,
      "meetingKey": 1219
    }
  ],
  "timestamp": "2024-03-15T10:30:00.000Z"
}
```

> `teamColor`는 `#` 없이 hex 6자리 문자열입니다.

---

### 3. 드라이버 타이밍 조회 (핵심 엔드포인트)

```
GET /api/v1/sessions/:sessionKey/driver-timings
```

레이스 전체를 2초 윈도우로 나눈 **사전 계산 프레임 배열**을 반환합니다. 프론트엔드는 이 데이터를 한 번에 받아 리플레이를 재생합니다.

**동작 방식:**
1. laps → intervals → drivers → stints 순서로 **순차 호출** (동시 호출 시 OpenF1 429 발생)
2. `date_start`가 null이거나 유효하지 않은 lap1 데이터는 레이스 시작 시간 계산에서 제외
3. intervals를 2초 단위로 그룹화하여 프레임 생성
4. 각 프레임의 `currentLapTime`, `bestLapTime`, `miniSector`는 **이전 완료 랩** 데이터 표시 (`displayDataLap = currentLap - 1`)
5. `tireInfo`는 **현재 랩** 스틴트 데이터 사용
6. DNF 드라이버는 각 프레임 내에서 맨 뒤로 재정렬, `position`/`interval` 재할당
7. 결과는 인메모리 캐시(10분)에 저장 — 동일 세션 재요청 시 즉시 반환

**응답 `data`**:

```json
{
  "success": true,
  "data": {
    "frames": [
      {
        "timeOffset": 42.5,
        "currentLap": 3,
        "drivers": [
          {
            "position": 1,
            "driverCode": "VER",
            "teamColor": "#3671C6",
            "interval": "--",
            "intervalToAhead": "",
            "currentLapTime": "1:12.456",
            "bestLapTime": "1:12.456",
            "miniSector": {
              "sector1": "fastest",
              "sector2": "personal_best",
              "sector3": "normal"
            },
            "tireInfo": {
              "compound": "SOFT",
              "lapCount": 5,
              "pitStops": 0
            }
          }
        ]
      }
    ]
  },
  "timestamp": "2024-03-15T10:30:00.000Z"
}
```

**`DriverDisplayFrame` 필드:**
| 필드 | 타입 | 설명 |
|------|------|------|
| `timeOffset` | `number` | 레이스 시작 기준 경과 초 |
| `currentLap` | `number` | 현재 진행 중인 랩 번호 |
| `drivers` | `DriverDisplayRow[]` | position 순 정렬된 드라이버 목록 |

**`DriverDisplayRow` 필드:**
| 필드 | 타입 | 설명 |
|------|------|------|
| `position` | `number` | 현재 순위 |
| `driverCode` | `string` | 드라이버 3자리 코드 (예: `"VER"`) |
| `teamColor` | `string` | `#RRGGBB` 포맷 |
| `interval` | `string` | 리더 기준 갭 (리더는 `"--"`, 나머지는 `"+1.234"`, DNF는 `"DNF"`) |
| `intervalToAhead` | `string` | 바로 앞 차와의 갭 (리더는 `""`, DNF는 `""`) |
| `currentLapTime` | `string` | 이전 완료 랩 타임 (`"1:12.456"`, 미완료 시 `"--:--:---"`, DNF 시 `"DNF"`) |
| `bestLapTime` | `string` | 세션 최고 랩 타임 |
| `miniSector.sector1~3` | `string` | `"fastest"` \| `"personal_best"` \| `"normal"` \| `"none"` |
| `tireInfo.compound` | `string` | `"SOFT"` \| `"MEDIUM"` \| `"HARD"` \| `"INTERMEDIATE"` \| `"WET"` \| `"UNKNOWN"` |
| `tireInfo.lapCount` | `number` | 현재 타이어 사용 랩 수 (`tyre_age_at_start` 포함) |
| `tireInfo.pitStops` | `number` | 완료된 피트스톱 횟수 |

---

### 4. 리플레이 시작 (데이터 프리로드)

```
POST /api/v1/sessions/:sessionKey/start-replay
```

OpenF1 API에서 세션 전체 데이터(drivers, laps, intervals, stints)를 미리 가져옵니다. 현재 Redis 캐시는 미연결 상태로 실질적인 캐싱 효과는 없으며, 응답은 요청 처리 결과만 반환합니다.

**응답:**
```json
{
  "success": true,
  "data": {
    "sessionKey": 9158,
    "data": {
      "cachingStatus": "completed",
      "availableData": ["drivers", "laps", "intervals", "car_data", "race_control", "stints"],
      "driverCount": 20,
      "dataStats": {
        "lapsCount": 1200,
        "intervalsCount": 8500,
        "stintsCount": 45
      },
      "drivers": []
    },
    "timestamp": "2024-03-15T10:30:00.000Z"
  },
  "timestamp": "2024-03-15T10:30:00.000Z"
}
```

> `data.data` 중첩 구조는 현재 구현의 `createResponse()` 래핑 방식에 의한 것입니다.

---

### 5. 레이스 플래그 조회

```
GET /api/v1/sessions/:sessionKey/race-flags
```

OpenF1 `race_control` 메시지를 기반으로 세션의 플래그 상태를 랩별/분별로 반환합니다. 결과는 인메모리 캐시(10분)에 저장됩니다.

**동작 방식:**
1. sessions → race_control → laps 순서로 순차 호출
2. 세션 타입 판별: `Race`/`Sprint` → `RACE`, `Qualifying`/`Shootout` → `QUALIFYING`, 그 외 → `PRACTICE`
3. 레이스: `lapFlags` 배열 (랩별 플래그 상태)
4. 퀄리파잉/연습: `minuteFlags` 배열 (분별 플래그 상태) + `lapFlags` 배열
5. `race_control` 메시지 중 `category`가 `Flag` 또는 `SafetyCar`이고, `scope`가 `Track`(전체 트랙)인 것만 처리

**응답:**
```json
{
  "success": true,
  "data": {
    "sessionType": "RACE",
    "totalLaps": 57,
    "lapFlags": ["NONE", "NONE", "SC", "SC", "NONE", "..."],
    "totalMinutes": 0,
    "minuteFlags": []
  },
  "timestamp": "2024-03-15T10:30:00.000Z"
}
```

**`RaceFlagsResponse` 필드:**
| 필드 | 타입 | 설명 |
|------|------|------|
| `sessionType` | `string` | `"RACE"` \| `"QUALIFYING"` \| `"PRACTICE"` |
| `totalLaps` | `number` | 세션 총 랩 수 |
| `lapFlags` | `LapFlagStatus[]` | 랩별 플래그 상태 배열 (인덱스 0 = 랩 1) |
| `totalMinutes` | `number` | 세션 총 시간(분). 레이스는 `0` |
| `minuteFlags` | `LapFlagStatus[]` | 분별 플래그 상태 배열 (퀄리파잉/연습 전용) |

**`LapFlagStatus` 값:**
| 값 | 설명 |
|------|------|
| `"NONE"` | 정상 (그린 플래그) |
| `"RED"` | 레드 플래그 |
| `"SC"` | 세이프티 카 |
| `"VSC"` | 버추얼 세이프티 카 |
| `"YELLOW"` | 옐로우 플래그 |

**플래그 분류 로직:**
- `flag: "RED"` 또는 메시지에 `"RED FLAG"` → `RED`
- 메시지에 `"VIRTUAL SAFETY CAR"` 또는 `"VSC"` → `VSC`
- 메시지에 `"SAFETY CAR"` 또는 `"SC DEPLOYED"` → `SC`
- `flag: "YELLOW"` 또는 메시지에 `"YELLOW FLAG"` → `YELLOW`
- `flag: "GREEN"` / `"CLEAR"` 또는 메시지에 `"GREEN FLAG"` / `"TRACK CLEAR"` → `NONE`으로 복귀

> 플래그 상태는 해당 랩(또는 분)부터 다음 GREEN 플래그까지 유지됩니다.

---

## 랩 데이터 API

### 세션 랩 조회

```
GET /api/v1/laps/session/:sessionKey
```

**Query Parameters**:
| 파라미터 | 필수 | 설명 |
|---------|------|------|
| `lapNumber` | 선택 | 특정 랩 번호 필터 |

**응답 `data`**: 변환된 랩 배열

```json
{
  "success": true,
  "data": [
    {
      "lapNumber": 1,
      "lapTime": 72.456,
      "sectors": {
        "sector1": 14.123,
        "sector2": 37.789,
        "sector3": 20.544
      },
      "isPitOutLap": false,
      "isDNF": false,
      "timestamp": "2024-03-15T10:30:00.000Z",
      "driverNumber": 1,
      "sessionKey": 9158
    }
  ],
  "timestamp": "2024-03-15T10:30:00.000Z"
}
```

> `isDNF`는 `lap_duration === null && !is_pit_out_lap`일 때 `true`입니다.
> 미니섹터 정보는 포함되지 않으며, `driver-timings` 엔드포인트를 사용하세요.

---

## 헬스체크 API

### 앱 상태 확인

```
GET /api/v1/health
```

### Circuit Breaker 상태 조회

```
GET /api/v1/health/circuit-breaker
```

```json
{
  "state": "CLOSED",
  "failureCount": 0,
  "lastFailureTime": null,
  "totalRequests": 150,
  "successfulRequests": 149,
  "failedRequests": 1
}
```

**Circuit Breaker 상태:**
- `CLOSED`: 정상 동작
- `OPEN`: 5회 연속 실패 후 차단 상태 — fallback으로 빈 배열 `[]` 반환
- `HALF_OPEN`: 30초 후 복구 시도 중

### Circuit Breaker 수동 리셋

```
POST /api/v1/health/circuit-breaker/reset
```

---

## 데이터 모델

### TransformedDriver
```typescript
interface TransformedDriver {
  number: number;
  name: string;          // name_acronym (예: "VER")
  fullName: string;      // 예: "Max VERSTAPPEN"
  team: string;
  teamColor: string;     // hex 6자리, # 없음 (예: "3671C6")
  countryCode: string;
  headShotUrl: string;
  sessionKey: number;
  meetingKey: number;
}
```

### DriverDisplayFrame / DriverDisplayRow
```typescript
interface DriverDisplayFrame {
  timeOffset: number;       // 레이스 시작 기준 경과 초
  currentLap: number;       // 현재 진행 중인 랩
  drivers: DriverDisplayRow[];
}

interface DriverDisplayRow {
  position: number;
  driverCode: string;
  teamColor: string;        // #RRGGBB 포맷
  interval: string;
  intervalToAhead: string;
  currentLapTime: string;   // "M:SS.mmm" | "--:--:---" | "DNF"
  bestLapTime: string;
  miniSector: {
    sector1: SectorPerf;
    sector2: SectorPerf;
    sector3: SectorPerf;
  };
  tireInfo: {
    compound: 'SOFT' | 'MEDIUM' | 'HARD' | 'INTERMEDIATE' | 'WET' | 'UNKNOWN';
    lapCount: number;
    pitStops: number;
  };
}

type SectorPerf = 'fastest' | 'personal_best' | 'normal' | 'none';
```

### RaceFlagsResponse
```typescript
interface RaceFlagsResponse {
  sessionType: 'RACE' | 'QUALIFYING' | 'PRACTICE';
  totalLaps: number;
  lapFlags: LapFlagStatus[];    // 인덱스 0 = 랩 1
  totalMinutes: number;         // 레이스는 0
  minuteFlags: LapFlagStatus[]; // 퀄리파잉/연습 전용
}

type LapFlagStatus = 'NONE' | 'RED' | 'SC' | 'VSC' | 'YELLOW';
```

---

## 데이터 변환 로직

### 미니섹터 성능 (driver-timings 기준)

`SessionsService.getSectorPerformance(segments[])` 로직:

| OpenF1 segments에 포함된 값 | 반환값 |
|---------------------------|--------|
| `2051` 포함 | `"fastest"` (세션 최고) |
| `2049` 포함 | `"personal_best"` (개인 최고) |
| `2048` 포함 | `"normal"` |
| 그 외 / 빈값 | `"none"` |

> `F1TransformationsUtil.analyzeSectorPerformance()`는 다른 타입(`'best' | 'personal_best' | 'neutral' | 'pit'`)을 사용합니다. `driver-timings`에는 위 로직이 적용됩니다.

### DRS 값 해석

| OpenF1 `drs` 값 | 변환 결과 |
|----------------|----------|
| `0`, `1` | `{ enabled: false, available: false }` |
| `8` | `{ enabled: false, available: true }` |
| `10`, `12`, `14` | `{ enabled: true, available: true }` |
| `null` | `{ enabled: false, available: false }` |

### DNF 판정

`driver-timings`에서의 DNF 판정은 다음 두 조건 중 하나를 만족하며, **이후 랩에 유효한 데이터가 없을 때** 적용됩니다:

```typescript
// 이후 랩에 유효한 lap_duration이 있으면 DNF가 아님 (레드플래그 등 일시적 null 구분)
const hasLaterValidLaps = driverLaps.some(l => l.lap_number > lapNum && l.lap_duration !== null);

isDNF = !hasLaterValidLaps && (
  // Case 1: 해당 랩 데이터가 있지만 lap_duration이 null (명시적 DNF)
  (lapAtN != null && lapAtN.lap_duration === null && !lapAtN.is_pit_out_lap && lapNum > 1) ||
  // Case 2: 해당 랩 데이터 자체가 없고, 이전 랩이 마지막 (완전 리타이어)
  (!lapAtN && driverLaps.length > 0 && driverMaxLap < lapNum)
);
```

> `laps` API(`/api/v1/laps/session/:sessionKey`)의 `isDNF`는 단순 판정: `lap_duration === null && !is_pit_out_lap`

### DNF 드라이버 정렬

DNF 드라이버는 각 프레임에서 **맨 뒤로 재정렬**됩니다:
- `position`: 활성 드라이버 뒤에 순서대로 재할당
- `interval`: `"DNF"`로 고정
- `intervalToAhead`: `""`로 고정

### 리더 gap_to_leader 정렬

`buildStandings`에서 `gap_to_leader`가 `null`인 드라이버는 맨 뒤로 정렬됩니다. 리더는 `gap_to_leader: 0`으로 처리됩니다.

---

## 에러 처리

| HTTP 상태 | 상황 |
|----------|------|
| `503 Service Unavailable` | OpenF1 API 호출 실패 |
| `404 Not Found` | 세션에 드라이버 없음 (`validateSession` 실패) |
| `400 Bad Request` | 파라미터 타입 오류 (ParseIntPipe 실패) |

Circuit Breaker가 OPEN 상태이면 API 호출 없이 즉시 빈 배열 `[]`을 반환합니다 (에러 없음).

---

## OpenF1 연동 특이사항

- **순차 호출**: `driver-timings`에서 laps/intervals/drivers/stints를 `Promise.all`이 아닌 순차 호출합니다. 동시 요청 시 OpenF1 429 Rate Limit이 발생하기 때문입니다.
- **429 재시도**: drivers, laps, intervals, stints 요청에 한해 자동 재시도 (sessions, car_data는 재시도 없음)
- **빈 배열 fallback**: Circuit Breaker OPEN 또는 일부 장애 시 빈 배열 반환 (예외 미발생)
