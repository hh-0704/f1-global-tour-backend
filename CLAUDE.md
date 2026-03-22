# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NestJS backend that proxies the [OpenF1 API](https://openf1.org/) (`https://api.openf1.org/v1`) with circuit-breaking, rate-limit retry logic, and pre-computed display frames for F1 race replay.

## Development Commands

```bash
npm run start:dev        # Hot reload dev server (port 4000)
npm run build            # Production build
npm run lint             # ESLint with auto-fix
npm run format           # Prettier

npm run test             # All unit tests
npm run test:watch       # TDD watch mode
npm run test:cov         # Coverage report
npx jest sessions.service.spec   # Single test file
npx jest laps                    # Pattern match
```

**Environment**: Copy `.env.example` to `.env`. Required vars: `PORT=4000`, `OPENF1_API_BASE_URL=https://api.openf1.org/v1`, `CORS_ORIGIN=http://localhost:3000`.

Swagger UI is available at `http://localhost:4000/api/docs` in dev.

## Architecture

### Active Modules

`SessionsModule`, `LapsModule`, `HealthModule` are registered in `AppModule`. Other modules (drivers, intervals, car-data, race-control, stints) have been removed.

### Request Flow

```
Controller → Service → CachedOpenF1ClientService → OpenF1ClientService → CircuitBreakerService → axios
```

**Important**: `CachedOpenF1ClientService` is currently a pass-through wrapper — it does **not** cache to Redis. The name is aspirational. The only actual caching is an in-memory `Map` in `SessionsService` and `RaceFlagsService` (10-min TTL each).

### Core Endpoint: `GET /api/v1/sessions/:sessionKey/driver-timings`

This is the main heavy-computation endpoint. It:
1. Fetches laps, intervals, drivers, stints **sequentially** (not `Promise.all`) to avoid OpenF1 429 rate limits
2. Filters out lap1 rows with null/invalid `date_start` when computing race start time
3. Pre-computes `DriverDisplayFrame[]` — one frame per 2-second window of the race
4. Each frame contains position-sorted `DriverDisplayRow[]` with interval gaps, lap times, mini-sector colours, and tire info
5. `displayDataLap` logic: frames show the *previous completed lap's* timing data, not the current in-progress lap
6. DNF drivers are re-sorted to the end of each frame with `position` re-assigned and `interval` set to `"DNF"`
7. Results cached in `SessionsService.framesCache` (Map) for 10 minutes

### Race Flags: `GET /api/v1/sessions/:sessionKey/race-flags`

`RaceFlagsService` provides per-lap/per-minute flag status from OpenF1 `race_control` messages:
- Session type mapping: Race/Sprint → `RACE`, Qualifying/Shootout → `QUALIFYING`, else → `PRACTICE`
- Race sessions: `lapFlags[]` (one status per lap)
- Qualifying/Practice: `minuteFlags[]` (one status per minute) + `lapFlags[]`
- Flag classification from `race_control` messages with `category` = `Flag` or `SafetyCar`, `scope` = `Track`
- Status values: `NONE`, `RED`, `SC`, `VSC`, `YELLOW`

### OpenF1 Resilience

- **Circuit Breaker** (`CircuitBreakerService`): CLOSED → OPEN after 5 failures, attempts recovery after 30s in HALF_OPEN
- **429 Retry** (`fetchWithRetry`): up to 3 retries with 2s/4s/6s delays (used by drivers, laps, intervals, stints; not sessions or car_data)
- Fallback: circuit-breaker returns empty array `[]` when OPEN

### Key Patterns

**BaseF1Service** — abstract base for services providing `executeWithErrorHandling`, `validateSession`, `createResponse`. `SessionsService` and `RaceFlagsService` extend it; `LapsService` does not.

**Segment values** (mini-sector colors): `2048`=yellow, `2049`=green/personal-best, `2051`=purple/fastest, `2064`=pit

**DRS values**: `0,1`=off, `8`=available-disabled, `10,12,14`=enabled

**DNF detection** (in `driver-timings`): Two cases, both requiring no valid laps after the current lap:
1. Lap data exists but `lap_duration === null && !is_pit_out_lap && lapNum > 1` (explicit DNF)
2. No lap data at all and driver's max lap < current lap (complete retirement)
Temporary nulls from red flags are distinguished by checking for later valid laps.

**DNF detection** (in `/laps` API): Simple check — `lap_duration === null && !is_pit_out_lap`

### Active API Endpoints

```
GET  /api/v1/sessions                               # List sessions (?country, ?year)
GET  /api/v1/sessions/:sessionKey/drivers           # Session drivers
GET  /api/v1/sessions/:sessionKey/driver-timings    # Pre-computed replay frames
GET  /api/v1/sessions/:sessionKey/race-flags        # Lap/minute flag status
POST /api/v1/sessions/:sessionKey/start-replay      # Preload data
GET  /api/v1/laps/session/:sessionKey               # Laps (?lapNumber)
GET  /api/v1/health                                 # App health
GET  /api/v1/health/circuit-breaker                 # Circuit breaker stats
POST /api/v1/health/circuit-breaker/reset           # Manual reset
```

### Adding a New Module

1. Create `src/modules/{name}/{name}.module.ts`, `.controller.ts`, `.service.ts`
2. Service should extend `BaseF1Service`; inject `CachedOpenF1ClientService`
3. Add query params interface to `common/interfaces/query-params.interface.ts`
4. Add fetch method to `OpenF1ClientService` (and corresponding pass-through in `CachedOpenF1ClientService`)
5. Register module in `AppModule`
