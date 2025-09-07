# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the **F1 Global Tour Backend** - a NestJS-based API server that serves as a proxy and data processing layer for the OpenF1 API. The backend provides F1 replay functionality by fetching, caching, and transforming historical F1 race data for frontend consumption.

### Core Purpose
- **OpenF1 API Proxy**: Acts as an intermediary between frontend and OpenF1 API (`https://api.openf1.org/v1`)
- **Data Caching**: Implements Redis-based caching for performance optimization
- **Data Transformation**: Converts OpenF1 API responses to frontend-compatible formats
- **Replay System**: Provides historical F1 race data for time-based replay functionality

## Architecture Overview

### Application Structure
The application follows NestJS modular architecture:
- **Modules**: Feature-based modules (sessions, drivers, laps, etc.) in `src/modules/`
- **Common Layer**: Shared utilities, DTOs, interfaces, and filters in `src/common/`
- **Configuration**: Centralized config management in `src/config/`

### Key Architectural Patterns
- **Proxy Pattern**: Backend acts as OpenF1 API proxy with data transformation
- **Caching Strategy**: Session-based data caching with Redis for replay optimization
- **Modular Design**: Each F1 data type (sessions, drivers, laps, telemetry) has its own module
- **Global Error Handling**: Unified API response format via `HttpExceptionFilter`

### API Design
- **Base Path**: `/api/v1`
- **Response Format**: Consistent `ApiResponseDto` wrapper for all endpoints
- **Error Handling**: Standardized error codes matching OpenF1 API failure scenarios

## Development Commands

### Essential Commands
```bash
# Development server with hot reload
npm run start:dev

# Production build and run
npm run build
npm run start:prod

# Code quality
npm run lint          # Run ESLint with auto-fix
npm run format       # Format code with Prettier

# Testing
npm run test         # Run unit tests
npm run test:watch   # Run tests in watch mode
npm run test:cov     # Run tests with coverage
npm run test:e2e     # Run end-to-end tests

# Single test file
npm run test -- --testPathPattern=sessions.service.spec.ts
```

### Development Setup
1. Copy `.env.example` to `.env` and configure environment variables
2. Install dependencies: `npm install`
3. Start development server: `npm run start:dev`
4. Server runs on port 4000 with CORS enabled for `localhost:3000`

## Key Implementation Details

### OpenF1 API Integration
- **Base URL**: Configurable via `OPENF1_API_BASE_URL` environment variable
- **Data Types**: Sessions, drivers, laps, car telemetry, intervals, race control, stints
- **Error Handling**: OpenF1 API failures mapped to specific error codes (`OPENF1_API_UNAVAILABLE`, etc.)

### Data Processing Pipeline
1. **Fetch**: Retrieve data from OpenF1 API endpoints
2. **Transform**: Convert OpenF1 response format to frontend-compatible structure
3. **Cache**: Store processed data in Redis for replay performance
4. **Serve**: Provide unified API responses via consistent DTO pattern

### Critical Data Transformations
- **DRS Values**: Convert OpenF1 DRS codes (0,1,8,10,12,14) to boolean enabled/available states
- **Segments**: Transform segment arrays (2048,2049,2051,2064) to mini-sector performance indicators
- **Lap Status**: Handle null `lap_duration` as DNF (Did Not Finish) status
- **Pit Detection**: Identify pit lane activity via segment value 2064

### Environment Configuration
Key environment variables (see `.env.example`):
- `PORT`: Server port (default: 4000)
- `OPENF1_API_BASE_URL`: OpenF1 API endpoint
- `CORS_ORIGIN`: Allowed frontend origin (default: localhost:3000)
- Redis, database, and caching configuration

### Module Development Pattern
When adding new F1 data endpoints:
1. Create module directory in `src/modules/`
2. Implement controller, service, and module files
3. Add OpenF1 interface definitions in `src/common/interfaces/`
4. Register module in `AppModule`
5. Follow existing error handling and response patterns

### Testing Strategy
- **Unit Tests**: Focus on data transformation logic and service methods
- **E2E Tests**: Test complete API endpoints with mock OpenF1 responses
- **Coverage**: Maintain coverage for critical data processing functions