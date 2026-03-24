import { Controller, Get, Query, Param, Post, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { SessionsService } from './sessions.service';
import { RaceFlagsService } from './race-flags.service';
import { ApiResponseDto } from '../../common/dto/api-response.dto';

@ApiTags('sessions')
@Controller('sessions')
export class SessionsController {
  constructor(
    private readonly sessionsService: SessionsService,
    private readonly raceFlagsService: RaceFlagsService,
  ) {}

  @Get()
  @ApiOperation({ summary: '세션 목록 조회', description: '국가명·연도로 필터링 가능한 F1 세션 목록 반환' })
  @ApiQuery({
    name: 'country',
    required: false,
    description: '국가명 필터',
    enum: [
      'Bahrain', 'Saudi Arabia', 'Australia', 'Azerbaijan', 'Miami', 'Monaco',
      'Spain', 'Canada', 'Austria', 'Great Britain', 'Hungary', 'Belgium',
      'Netherlands', 'Italy', 'Singapore', 'Japan', 'Qatar', 'United States',
      'Mexico', 'Brazil', 'Las Vegas', 'Abu Dhabi', 'China', 'Emilia Romagna'
    ]
  })
  @ApiQuery({
    name: 'year',
    required: false,
    description: '연도 필터',
    enum: ['2023', '2024', '2025']
  })
  @ApiResponse({ status: 200, description: '세션 목록 반환 성공' })
  async getSessions(
    @Query('country') country?: string,
    @Query('year') year?: string,
  ) {
    const sessions = await this.sessionsService.getSessions(country, year);
    return ApiResponseDto.success(sessions);
  }

  @Get(':sessionKey/drivers')
  @ApiOperation({ summary: '세션 드라이버 목록 조회', description: '특정 세션에 참가한 전체 드라이버 정보 반환' })
  @ApiParam({ name: 'sessionKey', description: '세션 고유 식별자' })
  @ApiResponse({ status: 200, description: '드라이버 목록 반환 성공' })
  async getSessionDrivers(@Param('sessionKey', ParseIntPipe) sessionKey: number) {
    const drivers = await this.sessionsService.getSessionDrivers(sessionKey);
    return ApiResponseDto.success(drivers);
  }

  @Get(':sessionKey/driver-timings')
  @ApiOperation({
    summary: '리플레이 프레임 전체 조회',
    description: [
      '레이스 전체를 2초 단위로 분할한 DriverDisplayFrame[] 반환.',
      '각 프레임에는 순위, 인터벌, 랩타임, 미니섹터, 타이어 정보가 포함됩니다.',
      '결과는 10분간 인메모리 캐시됩니다.',
      '⚠️ OpenF1 API를 4회 순차 호출하므로 첫 요청 시 수십 초 소요될 수 있습니다.',
    ].join(' '),
  })
  @ApiParam({ name: 'sessionKey', description: '세션 고유 식별자' })
  @ApiResponse({ status: 200, description: '리플레이 프레임 반환 성공' })
  async getDriverTimings(@Param('sessionKey', ParseIntPipe) sessionKey: number) {
    const data = await this.sessionsService.getDriverTimings(sessionKey);
    return ApiResponseDto.success(data);
  }

  @Get(':sessionKey/race-flags')
  @ApiOperation({
    summary: '레이스 플래그 정보 조회',
    description: [
      'OpenF1 race_control 메시지를 기반으로 세션의 플래그 상태를 랩별/분별로 반환.',
      '레이스: lapFlags 배열, 퀄리파잉/연습: minuteFlags 배열.',
      '결과는 10분간 인메모리 캐시됩니다.',
    ].join(' '),
  })
  @ApiParam({ name: 'sessionKey', description: '세션 고유 식별자' })
  @ApiResponse({ status: 200, description: '플래그 정보 반환 성공' })
  async getRaceFlags(@Param('sessionKey', ParseIntPipe) sessionKey: number) {
    const data = await this.raceFlagsService.getRaceFlags(sessionKey);
    return ApiResponseDto.success(data);
  }

  @Post(':sessionKey/start-replay')
  @ApiOperation({
    summary: '리플레이 시작 (데이터 프리로드)',
    description: 'drivers/laps/intervals/stints를 OpenF1에서 미리 가져옵니다. 현재 Redis 캐시는 미연결 상태입니다.',
  })
  @ApiParam({ name: 'sessionKey', description: '세션 고유 식별자' })
  @ApiResponse({ status: 200, description: '프리로드 완료' })
  async startReplay(@Param('sessionKey', ParseIntPipe) sessionKey: number) {
    const result = await this.sessionsService.startReplay(sessionKey);
    return ApiResponseDto.success(result);
  }
}
