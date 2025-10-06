# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**F1 Global Tour Backend** is a NestJS-based API server that acts as an intelligent proxy for the OpenF1 API, providing F1 replay functionality with caching, data transformation, and real-time updates for the F1 Global Tour frontend application.

### Core Responsibilities
- **OpenF1 API Proxy**: Fetch data from `https://api.openf1.org/v1` and transform it for frontend consumption
- **Redis Caching Layer**: Implement session-based caching with differentiated TTL strategies
- **Data Transformation**: Convert OpenF1 formats (DRS codes, segments, lap status) to frontend-compatible structures
- **Replay System**: Support historical F1 race data replay with 4-second interval updates matching OpenF1 API

## Development Commands

```bash
# Development with hot reload
npm run start:dev

# Production build and run
npm run build
npm run start:prod

# Debug mode with inspector
npm run start:debug

# Code quality
npm run lint                    # ESLint with auto-fix
npm run format                  # Prettier formatting

# Testing
npm run test                    # Run all unit tests
npm run test:watch              # Watch mode for TDD
npm run test:cov                # Generate coverage report
npm run test:e2e                # End-to-end tests

# Run specific test file
npm run test -- sessions.service.spec.ts
npm run test -- --testPathPattern=intervals
```

### Environment Setup
1. Copy `.env.example` to `.env`
2. Configure required environment variables:
   - `PORT=4000` (server port)
   - `OPENF1_API_BASE_URL=https://api.openf1.org/v1`
   - `CORS_ORIGIN=http://localhost:3000` (frontend origin)
   - Redis configuration (optional, defaults to localhost:6379)
3. Run `npm install`
4. Start with `npm run start:dev`

## Architecture Overview

### Module Structure
```
src/
├── modules/              # Feature-based modules
│   ├── sessions/        # Session management, replay initialization
│   ├── drivers/         # Driver information and standings
│   ├── laps/           # Lap data, fastest laps, analysis
│   ├── intervals/      # Timing gaps, live intervals
│   ├── car-data/       # Telemetry (speed, throttle, brake, DRS)
│   ├── race-control/   # Flags, safety car, race events
│   └── stints/         # Tire strategy, pit stops
├── common/
│   ├── services/       # Shared services (OpenF1 client, cache, base)
│   ├── utils/          # Data transformations (DRS, segments, DNF)
│   ├── dto/            # API response DTOs
│   ├── interfaces/     # OpenF1 API type definitions
│   ├── filters/        # HTTP exception handling
│   └── constants/      # F1-specific constants
├── config/             # Configuration management
└── main.ts            # Application bootstrap
```

### Key Architectural Patterns

#### 1. **Proxy Pattern with Caching**
The backend acts as a smart proxy between frontend and OpenF1 API:
```typescript
// Flow: Frontend → Backend API → CachedOpenF1ClientService → OpenF1ClientService → OpenF1 API
// All requests check Redis cache before hitting OpenF1 API
```

#### 2. **Module Hierarchy**
- **Controller**: HTTP endpoint handlers with validation
- **Service**: Business logic and data processing
- **OpenF1 Client**: Raw API calls with error handling
- **Cache Service**: Redis operations with session-based keys

#### 3. **Base Service Pattern**
All service classes extend `BaseF1Service` for:
- Standardized error handling with logging
- Consistent operation execution patterns
- Automatic error transformation to HTTP exceptions

#### 4. **Unified Response Format**
All endpoints return consistent `ApiResponseDto`:
```typescript
{
  success: boolean;
  data: T;                    // Typed response data
  timestamp: string;          // ISO 8601 timestamp
  error?: {                   // Only present on failure
    code: string;
    message: string;
    details?: any;
  }
}
```

### Data Transformation Pipeline

#### Critical Transformations (`F1TransformationsUtil`)
1. **DRS Decoding**:
   - OpenF1 values: `0,1,8,10,12,14` → `{enabled: boolean, available: boolean}`
   - Values 10/12/14 = enabled and available
   - Value 8 = available but not enabled
   - Values 0/1 = not available

2. **Segment Analysis**:
   - OpenF1 segments: `2048,2049,2051,2064` → Performance indicators
   - `2051` = Purple (fastest overall)
   - `2049` = Green (personal best)
   - `2048` = Yellow (normal)
   - `2064` = Pit lane detection

3. **DNF (Did Not Finish) Handling**:
   - `lap_duration: null` indicates retirement
   - Interval displays "DNF" instead of timing
   - Sector performance shows 'none' for retired drivers

4. **Lap Status Processing**:
   - Pit detection via segment value 2064
   - Out-lap identification from `is_pit_out_lap` flag
   - Fastest lap tracking across session

### Caching Strategy

#### Session-Based Cache Keys
```typescript
// Pattern: {dataType}:{sessionKey}:{specificIdentifier}
session:9472:drivers              // All drivers in session
session:9472:laps                 // All laps in session
session:9472:intervals:latest     // Latest interval data
session:9472:driver:44:laps       // Specific driver's laps
```

#### Differentiated TTL Policy
- **Sessions**: 3600s (1 hour) - rarely changes
- **Drivers**: 1800s (30 minutes) - stable data
- **Laps**: 900s (15 minutes) - moderate updates
- **Intervals**: 300s (5 minutes) - frequent updates
- **Telemetry**: 600s (10 minutes) - large volume
- **Stints**: 1800s (30 minutes) - tire strategy

#### Replay Pre-loading
When `POST /sessions/{sessionKey}/start-replay` is called:
1. Fetch all session data in parallel (drivers, laps, intervals, etc.)
2. Cache everything with appropriate TTLs
3. Return success to frontend for immediate playback

### API Endpoint Patterns

#### Standard Endpoints
```http
# All modules follow consistent patterns:
GET  /api/v1/{module}/session/{sessionKey}
GET  /api/v1/{module}/session/{sessionKey}/driver/{driverNumber}
GET  /api/v1/{module}/session/{sessionKey}/lap/{lapNumber}

# Examples:
GET  /api/v1/intervals/session/9472
GET  /api/v1/laps/session/9472
GET  /api/v1/sessions/9472/drivers
POST /api/v1/sessions/9472/start-replay
```

#### Query Parameters
Most endpoints support filtering via query parameters:
- `?driverNumber=44` - Filter by specific driver
- `?lapNumber=15` - Filter by specific lap
- `?date=2024-03-15T10:30:00.000Z` - Filter by timestamp

### Error Handling

#### Error Codes
- `OPENF1_API_UNAVAILABLE` - OpenF1 API is down or unreachable
- `SESSION_NOT_FOUND` - Requested session doesn't exist
- `DRIVER_NOT_FOUND` - Driver not found in session
- `INVALID_PARAMETERS` - Validation failed on request parameters
- `CACHE_ERROR` - Redis connection or operation failure

#### Graceful Degradation
1. Try OpenF1 API
2. If cached data exists, return stale data with warning
3. If no cache, return error with specific code
4. Frontend handles fallback to mock data

### OpenF1 API Integration

#### Request Flow
```
Controller → Service → CachedOpenF1ClientService → [Cache Check]
                                                   ↓ Miss
                                    OpenF1ClientService → axios
                                                   ↓ Success
                                         [Cache Store] → Return Data
```

#### Error Handling in OpenF1 Client
- Automatic retry with exponential backoff (3 attempts)
- Timeout configuration (10 seconds default)
- Detailed logging of failures
- Circuit breaker pattern (implemented in `CircuitBreakerService`)

### Module Development Guidelines

#### Adding New Endpoints
1. **Create/Update Module**: `src/modules/{module-name}/`
2. **Define Controller**: Add route handlers with validation
3. **Implement Service**: Business logic using `BaseF1Service`
4. **Add OpenF1 Interface**: Define types in `common/interfaces/openf1.interface.ts`
5. **Update Client**: Add method to `OpenF1ClientService` if needed
6. **Register Module**: Import in `AppModule`

#### Example Pattern
```typescript
// Controller
@Controller('laps')
export class LapsController {
  @Get('session/:sessionKey')
  async getSessionLaps(@Param('sessionKey', ParseIntPipe) sessionKey: number) {
    const laps = await this.lapsService.getSessionLaps(sessionKey);
    return ApiResponseDto.success(laps);
  }
}

// Service (extends BaseF1Service)
export class LapsService extends BaseF1Service {
  async getSessionLaps(sessionKey: number) {
    return this.executeWithErrorHandling(
      () => this.cachedOpenf1Client.fetchLaps({ session_key: sessionKey }),
      'getSessionLaps',
      { sessionKey }
    );
  }
}
```

### Testing Strategy

#### Unit Tests
- Focus on data transformation logic (`F1TransformationsUtil`)
- Mock OpenF1 client responses
- Test error handling paths
- Coverage target: 80%+ for services

#### E2E Tests
- Test complete API flows with real HTTP requests
- Mock OpenF1 API responses
- Verify response format and data structure
- Test cache behavior

#### Running Tests
```bash
# Single test file
npm run test -- laps.service.spec.ts

# Specific test pattern
npm run test -- --testNamePattern="should transform DRS values"

# Watch mode for TDD
npm run test:watch

# Coverage report
npm run test:cov
```

### Common Development Tasks

#### Debugging OpenF1 API Issues
1. Check OpenF1 API status: `curl https://api.openf1.org/v1/sessions?limit=1`
2. Enable debug logging: Set `NODE_ENV=development` in `.env`
3. Check backend logs for detailed error messages
4. Verify Redis connection: `redis-cli ping`

#### Adding New Data Transformations
1. Add transformation logic to `common/utils/f1-transformations.util.ts`
2. Write unit tests for transformation
3. Use in service layer via import
4. Document transformation mapping in code comments

#### Cache Invalidation
```typescript
// Clear all session data
await cacheService.deletePattern(`session:${sessionKey}:*`);

// Clear specific data type
await cacheService.delete(`session:${sessionKey}:laps`);
```

### Performance Considerations

#### Optimization Strategies
- **Parallel Fetching**: Use `Promise.all()` for independent data requests
- **Compression**: GZIP enabled for responses > 1KB (configured in `main.ts`)
- **Cache-First**: Always check cache before OpenF1 API
- **Batch Operations**: Replay pre-loading fetches all data at once

#### Monitoring Points
- OpenF1 API response times
- Cache hit/miss ratios
- Redis connection health
- Memory usage during replay sessions

### Frontend Integration

#### Expected Request Patterns
1. **Session List**: Frontend queries available sessions
2. **Session Selection**: Frontend calls `start-replay` endpoint
3. **Replay Playback**: Frontend requests intervals every 4 seconds
4. **Driver Details**: Frontend fetches telemetry on-demand

#### CORS Configuration
Configured in `main.ts`:
```typescript
app.enableCors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
```

### Documentation References

- **[README.md](./README.md)**: Quick start and basic setup
- **[REPLAY_API_SPECIFICATION.md](./REPLAY_API_SPECIFICATION.md)**: Complete API specification
- **[BACKEND_ARCHITECTURE_PLAN.md](./BACKEND_ARCHITECTURE_PLAN.md)**: Architecture details and implementation plan
- **[OpenF1 API Documentation](https://openf1.org/)**: Upstream data source
