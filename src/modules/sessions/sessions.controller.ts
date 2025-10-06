import { Controller, Get, Query, Param, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { SessionsService } from './sessions.service';
import { ApiResponseDto } from '../../common/dto/api-response.dto';

@ApiTags('sessions')
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all sessions', description: 'Retrieve F1 sessions with optional filtering by country and year' })
  @ApiQuery({
    name: 'country',
    required: false,
    description: 'Filter by country name',
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
    description: 'Filter by year',
    enum: ['2023', '2024', '2025']
  })
  @ApiResponse({ status: 200, description: 'Sessions retrieved successfully' })
  async getSessions(
    @Query('country') country?: string,
    @Query('year') year?: string,
  ) {
    try {
      const sessions = await this.sessionsService.getSessions(country, year);
      return ApiResponseDto.success(sessions);
    } catch (error) {
      throw error;
    }
  }

  @Get(':sessionKey/drivers')
  @ApiOperation({ summary: 'Get session drivers', description: 'Retrieve all drivers participating in a specific session' })
  @ApiParam({ name: 'sessionKey', description: 'Unique session identifier' })
  @ApiResponse({ status: 200, description: 'Drivers retrieved successfully' })
  async getSessionDrivers(@Param('sessionKey') sessionKey: string) {
    try {
      const drivers = await this.sessionsService.getSessionDrivers(
        Number(sessionKey),
      );
      return ApiResponseDto.success(drivers);
    } catch (error) {
      throw error;
    }
  }

  @Post(':sessionKey/start-replay')
  @ApiOperation({ summary: 'Start replay session', description: 'Initialize replay mode by pre-loading all session data into cache' })
  @ApiParam({ name: 'sessionKey', description: 'Unique session identifier' })
  @ApiResponse({ status: 200, description: 'Replay session started successfully' })
  async startReplay(@Param('sessionKey') sessionKey: string) {
    try {
      const result = await this.sessionsService.startReplay(Number(sessionKey));
      return ApiResponseDto.success(result);
    } catch (error) {
      throw error;
    }
  }
}
