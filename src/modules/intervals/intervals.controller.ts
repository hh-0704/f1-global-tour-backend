import { Controller, Get, Param, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { IntervalsService } from './intervals.service';
import { ApiResponseDto } from '../../common/dto/api-response.dto';

@ApiTags('intervals')
@Controller('intervals')
export class IntervalsController {
  constructor(private readonly intervalsService: IntervalsService) {}

  @Get('session/:sessionKey')
  @ApiOperation({ summary: 'Get session intervals', description: 'Retrieve timing intervals for a session' })
  @ApiParam({ name: 'sessionKey', description: 'Session identifier' })
  @ApiQuery({ name: 'date', required: false, description: 'Filter by specific date (ISO 8601)' })
  @ApiResponse({ status: 200, description: 'Intervals retrieved successfully' })
  async getSessionIntervals(
    @Param('sessionKey', ParseIntPipe) sessionKey: number,
    @Query('date') date?: string,
  ): Promise<ApiResponseDto<any>> {
    const intervals = await this.intervalsService.getSessionIntervals(
      sessionKey,
      date,
    );

    return {
      success: true,
      data: intervals,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('session/:sessionKey/live')
  @ApiOperation({ summary: 'Get live intervals', description: 'Retrieve latest real-time timing intervals' })
  @ApiParam({ name: 'sessionKey', description: 'Session identifier' })
  @ApiResponse({ status: 200, description: 'Live intervals retrieved successfully' })
  async getLiveIntervals(
    @Param('sessionKey', ParseIntPipe) sessionKey: number,
  ): Promise<ApiResponseDto<any>> {
    const liveIntervals =
      await this.intervalsService.getLiveIntervals(sessionKey);

    return {
      success: true,
      data: liveIntervals,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('session/:sessionKey/standings')
  @ApiOperation({ summary: 'Get standings', description: 'Retrieve current race standings with intervals' })
  @ApiParam({ name: 'sessionKey', description: 'Session identifier' })
  @ApiQuery({ name: 'date', required: false, description: 'Filter by specific date (ISO 8601)' })
  @ApiResponse({ status: 200, description: 'Standings retrieved successfully' })
  async getStandings(
    @Param('sessionKey', ParseIntPipe) sessionKey: number,
    @Query('date') date?: string,
  ): Promise<ApiResponseDto<any>> {
    const standings = await this.intervalsService.getStandings(
      sessionKey,
      date,
    );

    return {
      success: true,
      data: standings,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('session/:sessionKey/driver/:driverNumber/gaps')
  @ApiOperation({ summary: 'Get driver gaps', description: 'Retrieve gap information for a specific driver' })
  @ApiParam({ name: 'sessionKey', description: 'Session identifier' })
  @ApiParam({ name: 'driverNumber', description: 'Driver racing number' })
  @ApiResponse({ status: 200, description: 'Driver gaps retrieved successfully' })
  async getDriverGaps(
    @Param('sessionKey', ParseIntPipe) sessionKey: number,
    @Param('driverNumber', ParseIntPipe) driverNumber: number,
  ): Promise<ApiResponseDto<any>> {
    const gaps = await this.intervalsService.getDriverGaps(
      sessionKey,
      driverNumber,
    );

    return {
      success: true,
      data: gaps,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('session/:sessionKey/history')
  @ApiOperation({ summary: 'Get intervals history', description: 'Retrieve historical interval data for the session' })
  @ApiParam({ name: 'sessionKey', description: 'Session identifier' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date filter (ISO 8601)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date filter (ISO 8601)' })
  @ApiResponse({ status: 200, description: 'Intervals history retrieved successfully' })
  async getIntervalsHistory(
    @Param('sessionKey', ParseIntPipe) sessionKey: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<ApiResponseDto<any>> {
    const history = await this.intervalsService.getIntervalsHistory(
      sessionKey,
      startDate,
      endDate,
    );

    return {
      success: true,
      data: history,
      timestamp: new Date().toISOString(),
    };
  }
}
