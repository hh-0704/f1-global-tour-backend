import { Controller, Get, Param, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { RaceControlService } from './race-control.service';
import { ApiResponseDto } from '../../common/dto/api-response.dto';

/**
 * RaceControlController
 *
 * 레이스 컨트롤 관련 API 엔드포인트를 처리하는 컨트롤러.
 * OpenF1 API의 race_control 데이터를 기반으로 깃발, 사고, 세이프티카,
 * 타임라인, 페널티, DRS 구역 정보를 프론트엔드에 제공한다.
 *
 * [프론트엔드 연동 시 참고]
 * - 모든 응답은 ApiResponseDto 형식: { success, data, timestamp }
 * - sessionKey: OpenF1 세션 식별자 (숫자)
 * - 날짜 필터는 ISO 8601 형식 사용 (예: "2024-03-15T10:30:00.000Z")
 * - 카테고리 필터는 category 쿼리 파라미터로 전달 (예: ?category=Flag)
 */
@ApiTags('race-control')
@Controller('race-control')
export class RaceControlController {
  constructor(private readonly raceControlService: RaceControlService) {}

  /**
   * GET /race-control/session/:sessionKey
   *
   * 세션 전체 레이스 컨트롤 메시지를 반환한다.
   *
   * [프론트엔드 연동 시 참고]
   * - 반환 데이터: { sessionKey, totalMessages, messages[], summary }
   * - messages 배열은 timestamp 기준 오름차순 정렬됨
   * - 옵션: ?date=ISO8601 로 특정 시점 이후 메시지만 필터링 가능
   */
  @Get('session/:sessionKey')
  @ApiOperation({ summary: 'Get race control data', description: 'Retrieve all race control information for a session' })
  @ApiParam({ name: 'sessionKey', description: 'Session identifier' })
  @ApiQuery({ name: 'date', required: false, description: 'Filter by specific date (ISO 8601)' })
  @ApiResponse({ status: 200, description: 'Race control data retrieved successfully' })
  async getSessionRaceControl(
    @Param('sessionKey', ParseIntPipe) sessionKey: number,
    @Query('date') date?: string,
  ): Promise<ApiResponseDto<any>> {
    const raceControl = await this.raceControlService.getSessionRaceControl(
      sessionKey,
      date,
    );

    return {
      success: true,
      data: raceControl,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /race-control/session/:sessionKey/flags
   *
   * 세션 내 깃발(Flag) 관련 메시지만 필터링해서 반환한다.
   *
   * [프론트엔드 연동 시 참고]
   * - 반환 데이터: { sessionKey, totalFlagMessages, flagMessages[], flagPeriods[], flagSummary }
   * - flagPeriods: 각 깃발이 발생한 구간의 시작/종료/지속시간 포함
   * - flagSummary: 깃발 종류별 발생 횟수 집계 (YELLOW, RED, GREEN 등)
   * - 프론트에서 트랙 상태 표시(깃발 아이콘, 색상)에 활용 권장
   */
  @Get('session/:sessionKey/flags')
  @ApiOperation({ summary: 'Get flags', description: 'Retrieve flag information (yellow, red, green, etc.)' })
  @ApiParam({ name: 'sessionKey', description: 'Session identifier' })
  @ApiQuery({ name: 'date', required: false, description: 'Filter by specific date (ISO 8601)' })
  @ApiResponse({ status: 200, description: 'Flags retrieved successfully' })
  async getFlags(
    @Param('sessionKey', ParseIntPipe) sessionKey: number,
    @Query('date') date?: string,
  ): Promise<ApiResponseDto<any>> {
    const flags = await this.raceControlService.getFlags(sessionKey, date);

    return {
      success: true,
      data: flags,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /race-control/session/:sessionKey/incidents
   *
   * 세션 내 사고(Incident) 관련 메시지를 반환한다.
   *
   * [프론트엔드 연동 시 참고]
   * - 반환 데이터: { sessionKey, totalIncidents, incidents[], categorizedIncidents, incidentTimeline[] }
   * - categorizedIncidents: 충돌/스핀/코스이탈/데브리/기타로 분류
   * - incidentTimeline: 각 사고의 timestamp, type, severity(LOW/MEDIUM/HIGH) 포함
   * - severity는 수반된 깃발(레드=HIGH, 옐로우=MEDIUM) 기준으로 판정됨
   */
  @Get('session/:sessionKey/incidents')
  @ApiOperation({ summary: 'Get incidents', description: 'Retrieve race incidents and investigations' })
  @ApiParam({ name: 'sessionKey', description: 'Session identifier' })
  @ApiQuery({ name: 'date', required: false, description: 'Filter by specific date (ISO 8601)' })
  @ApiResponse({ status: 200, description: 'Incidents retrieved successfully' })
  async getIncidents(
    @Param('sessionKey', ParseIntPipe) sessionKey: number,
    @Query('date') date?: string,
  ): Promise<ApiResponseDto<any>> {
    const incidents = await this.raceControlService.getIncidents(
      sessionKey,
      date,
    );

    return {
      success: true,
      data: incidents,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /race-control/session/:sessionKey/safety-car
   *
   * 세이프티카(SC) 및 버추얼 세이프티카(VSC) 구간 정보를 반환한다.
   *
   * [프론트엔드 연동 시 참고]
   * - 반환 데이터: { sessionKey, safetyCarPeriods[], virtualSafetyCarPeriods[], totalSafetyCarTime, totalVSCTime, messages[] }
   * - safetyCarPeriods / virtualSafetyCarPeriods: 각 구간의 deployed/recalled 타임스탬프, duration(ms) 포함
   * - totalSafetyCarTime / totalVSCTime: 전체 누적 시간(ms), 프론트 통계 UI에 활용 가능
   * - 리플레이 타임라인에서 SC/VSC 구간 시각화에 사용 권장
   */
  @Get('session/:sessionKey/safety-car')
  @ApiOperation({ summary: 'Get safety car periods', description: 'Retrieve safety car and virtual safety car periods' })
  @ApiParam({ name: 'sessionKey', description: 'Session identifier' })
  @ApiQuery({ name: 'date', required: false, description: 'Filter by specific date (ISO 8601)' })
  @ApiResponse({ status: 200, description: 'Safety car periods retrieved successfully' })
  async getSafetyCarPeriods(
    @Param('sessionKey', ParseIntPipe) sessionKey: number,
    @Query('date') date?: string,
  ): Promise<ApiResponseDto<any>> {
    const safetyCarPeriods = await this.raceControlService.getSafetyCarPeriods(
      sessionKey,
      date,
    );

    return {
      success: true,
      data: safetyCarPeriods,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /race-control/session/:sessionKey/timeline
   *
   * 레이스 전체 이벤트를 시간순으로 정리한 타임라인을 반환한다.
   *
   * [프론트엔드 연동 시 참고]
   * - 반환 데이터: { sessionKey, dateRange, totalEvents, timeline[], timeGroups, eventTypes }
   * - timeline 항목: { timestamp, type(FLAG/INCIDENT/PENALTY/SAFETY_CAR/DRS/OTHER), message, category, flag, scope, sector }
   * - timeGroups: 5분 단위로 그룹화된 이벤트 맵 (키: ISO 8601 시각)
   * - eventTypes: 이벤트 종류별 발생 횟수 집계
   * - ?startDate / ?endDate 로 특정 구간만 조회 가능 (ISO 8601)
   * - 리플레이 진행 바(progress bar)나 이벤트 오버레이 구현에 활용 권장
   */
  @Get('session/:sessionKey/timeline')
  @ApiOperation({ summary: 'Get race timeline', description: 'Retrieve chronological timeline of race events' })
  @ApiParam({ name: 'sessionKey', description: 'Session identifier' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date filter (ISO 8601)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date filter (ISO 8601)' })
  @ApiResponse({ status: 200, description: 'Race timeline retrieved successfully' })
  async getRaceTimeline(
    @Param('sessionKey', ParseIntPipe) sessionKey: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<ApiResponseDto<any>> {
    const timeline = await this.raceControlService.getRaceTimeline(
      sessionKey,
      startDate,
      endDate,
    );

    return {
      success: true,
      data: timeline,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /race-control/session/:sessionKey/penalties
   *
   * 세션 내 페널티 정보를 반환한다.
   *
   * [프론트엔드 연동 시 참고]
   * - 반환 데이터: { sessionKey, driverNumber, totalPenalties, penalties[], summary }
   * - penalties 항목: { penaltyType, penaltyReason, affectedDriver, severity(LOW/MEDIUM/HIGH), ... }
   * - ?driverNumber=숫자 로 특정 드라이버 페널티만 필터링 가능
   * - summary: 페널티 종류별/심각도별 집계 포함
   * - 드라이버 카드 상세 화면 또는 레이스 이벤트 로그에 활용 권장
   */
  @Get('session/:sessionKey/penalties')
  @ApiOperation({ summary: 'Get penalties', description: 'Retrieve penalties issued during the session' })
  @ApiParam({ name: 'sessionKey', description: 'Session identifier' })
  @ApiQuery({ name: 'driverNumber', required: false, description: 'Filter by driver racing number' })
  @ApiResponse({ status: 200, description: 'Penalties retrieved successfully' })
  async getPenalties(
    @Param('sessionKey', ParseIntPipe) sessionKey: number,
    @Query('driverNumber', ParseIntPipe) driverNumber?: number,
  ): Promise<ApiResponseDto<any>> {
    const penalties = await this.raceControlService.getPenalties(
      sessionKey,
      driverNumber,
    );

    return {
      success: true,
      data: penalties,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /race-control/session/:sessionKey/drs-zones
   *
   * 서킷의 DRS 구역 정보 및 활성화 이력을 반환한다.
   *
   * [프론트엔드 연동 시 참고]
   * - 반환 데이터: { sessionKey, drsMessages[], drsZones[], drsActivations, drsEnabled, totalDRSMessages }
   * - drsZones: DRS 활성화 타임스탬프와 구역 인덱스 목록 (실제 트랙 위치 좌표는 미포함)
   * - drsActivations: { totalMessages, enabledCount, disabledCount }
   * - drsEnabled: boolean — DRS가 세션 중 활성화된 적 있는지 여부
   * - 실제 DRS 구역 좌표 데이터는 OpenF1에서 제공하지 않으므로 별도 트랙 데이터 필요
   */
  @Get('session/:sessionKey/drs-zones')
  @ApiOperation({ summary: 'Get DRS zones', description: 'Retrieve DRS zone locations for the circuit' })
  @ApiParam({ name: 'sessionKey', description: 'Session identifier' })
  @ApiResponse({ status: 200, description: 'DRS zones retrieved successfully' })
  async getDRSZones(
    @Param('sessionKey', ParseIntPipe) sessionKey: number,
  ): Promise<ApiResponseDto<any>> {
    const drsZones = await this.raceControlService.getDRSZones(sessionKey);

    return {
      success: true,
      data: drsZones,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /race-control/:sessionKey  (alias 엔드포인트)
   *
   * /race-control/session/:sessionKey 와 동일한 데이터를 제공하는 단축 경로.
   * category 쿼리 파라미터로 특정 카테고리만 필터링할 수 있다.
   *
   * [프론트엔드 연동 시 참고]
   * - 이 엔드포인트는 프론트에서 직접 sessionKey 로 간편하게 호출할 때 사용
   * - ?category=Flag / ?category=SafetyCar / ?category=Drs 등으로 필터링
   * - category 미입력 시 전체 레이스 컨트롤 데이터 반환
   * - 응답 구조는 getSessionRaceControl 과 동일: { sessionKey, totalMessages, messages[], summary }
   *
   * [주의] /race-control/session/:sessionKey 경로가 우선이므로
   *        "session" 이라는 sessionKey 값은 이 라우트로 처리됨에 유의
   */
  @Get(':sessionKey')
  @ApiOperation({ summary: 'Get race control data (alias)', description: 'Alias endpoint for race control data. Supports optional category filtering (e.g., category=Flag).' })
  @ApiParam({ name: 'sessionKey', description: 'Session identifier' })
  @ApiQuery({ name: 'category', required: false, description: 'Filter by message category (e.g., Flag, SafetyCar, Drs)' })
  @ApiResponse({ status: 200, description: 'Race control data retrieved successfully' })
  async getSessionRaceControlDirect(
    @Param('sessionKey', ParseIntPipe) sessionKey: number,
    @Query('category') category?: string,
  ): Promise<ApiResponseDto<any>> {
    const raceControl = await this.raceControlService.getSessionRaceControlByCategory(
      sessionKey,
      category,
    );

    return {
      success: true,
      data: raceControl,
      timestamp: new Date().toISOString(),
    };
  }
}
