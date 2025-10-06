import { Controller, Get, Param, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { LapsService } from './laps.service';
import { ApiResponseDto } from '../../common/dto/api-response.dto';

@ApiTags('laps')
@Controller('laps')
export class LapsController {
  constructor(private readonly lapsService: LapsService) {}

  @Get('session/:sessionKey')
  @ApiOperation({ summary: 'Get session laps', description: 'Retrieve all lap data for a session' })
  @ApiParam({ name: 'sessionKey', description: 'Session identifier' })
  @ApiQuery({ name: 'lapNumber', required: false, description: 'Filter by lap number' })
  @ApiResponse({ status: 200, description: 'Laps retrieved successfully' })
  async getSessionLaps(
    @Param('sessionKey', ParseIntPipe) sessionKey: number,
    @Query('lapNumber') lapNumber?: number,
  ): Promise<ApiResponseDto<any>> {
    const laps = await this.lapsService.getSessionLaps(sessionKey, lapNumber);

    return {
      success: true,
      data: laps,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('session/:sessionKey/lap/:lapNumber')
  @ApiOperation({ summary: 'Get specific lap', description: 'Retrieve data for a specific lap number' })
  @ApiParam({ name: 'sessionKey', description: 'Session identifier' })
  @ApiParam({ name: 'lapNumber', description: 'Lap number' })
  @ApiResponse({ status: 200, description: 'Lap data retrieved successfully' })
  async getSpecificLap(
    @Param('sessionKey', ParseIntPipe) sessionKey: number,
    @Param('lapNumber', ParseIntPipe) lapNumber: number,
  ): Promise<ApiResponseDto<any>> {
    const lap = await this.lapsService.getSpecificLap(sessionKey, lapNumber);

    return {
      success: true,
      data: lap,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('session/:sessionKey/driver/:driverNumber')
  @ApiOperation({ summary: 'Get driver laps', description: 'Retrieve lap data for a specific driver' })
  @ApiParam({ name: 'sessionKey', description: 'Session identifier' })
  @ApiParam({ name: 'driverNumber', description: 'Driver racing number' })
  @ApiQuery({ name: 'lapNumber', required: false, description: 'Filter by lap number' })
  @ApiResponse({ status: 200, description: 'Driver laps retrieved successfully' })
  async getDriverLaps(
    @Param('sessionKey', ParseIntPipe) sessionKey: number,
    @Param('driverNumber', ParseIntPipe) driverNumber: number,
    @Query('lapNumber') lapNumber?: number,
  ): Promise<ApiResponseDto<any>> {
    const laps = await this.lapsService.getDriverLaps(
      sessionKey,
      driverNumber,
      lapNumber,
    );

    return {
      success: true,
      data: laps,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('session/:sessionKey/fastest')
  @ApiOperation({ summary: 'Get fastest laps', description: 'Retrieve fastest laps in the session' })
  @ApiParam({ name: 'sessionKey', description: 'Session identifier' })
  @ApiQuery({ name: 'limit', required: false, description: 'Limit number of results' })
  @ApiResponse({ status: 200, description: 'Fastest laps retrieved successfully' })
  async getFastestLaps(
    @Param('sessionKey', ParseIntPipe) sessionKey: number,
    @Query('limit') limit?: number,
  ): Promise<ApiResponseDto<any>> {
    const fastestLaps = await this.lapsService.getFastestLaps(
      sessionKey,
      limit,
    );

    return {
      success: true,
      data: fastestLaps,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('session/:sessionKey/analysis')
  @ApiOperation({ summary: 'Get lap analysis', description: 'Retrieve detailed lap analysis for the session' })
  @ApiParam({ name: 'sessionKey', description: 'Session identifier' })
  @ApiResponse({ status: 200, description: 'Lap analysis retrieved successfully' })
  async getLapAnalysis(
    @Param('sessionKey', ParseIntPipe) sessionKey: number,
  ): Promise<ApiResponseDto<any>> {
    const analysis = await this.lapsService.getLapAnalysis(sessionKey);

    return {
      success: true,
      data: analysis,
      timestamp: new Date().toISOString(),
    };
  }
}
