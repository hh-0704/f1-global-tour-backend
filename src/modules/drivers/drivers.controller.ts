import { Controller, Get, Param, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { DriversService } from './drivers.service';
import { ApiResponseDto } from '../../common/dto/api-response.dto';

@ApiTags('drivers')
@Controller('drivers')
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Get('session/:sessionKey')
  @ApiOperation({ summary: 'Get session drivers', description: 'Retrieve all drivers in a specific session' })
  @ApiParam({ name: 'sessionKey', description: 'Session identifier' })
  @ApiResponse({ status: 200, description: 'Drivers retrieved successfully' })
  async getSessionDrivers(
    @Param('sessionKey', ParseIntPipe) sessionKey: number,
  ): Promise<ApiResponseDto<any>> {
    const drivers = await this.driversService.getSessionDrivers(sessionKey);

    return {
      success: true,
      data: drivers,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('session/:sessionKey/driver/:driverNumber/telemetry')
  @ApiOperation({ summary: 'Get driver telemetry', description: 'Retrieve telemetry data for a specific driver' })
  @ApiParam({ name: 'sessionKey', description: 'Session identifier' })
  @ApiParam({ name: 'driverNumber', description: 'Driver racing number' })
  @ApiQuery({ name: 'dateStart', required: false, description: 'Start date filter (ISO 8601)' })
  @ApiQuery({ name: 'dateEnd', required: false, description: 'End date filter (ISO 8601)' })
  @ApiResponse({ status: 200, description: 'Telemetry data retrieved successfully' })
  async getDriverTelemetry(
    @Param('sessionKey', ParseIntPipe) sessionKey: number,
    @Param('driverNumber', ParseIntPipe) driverNumber: number,
    @Query('dateStart') dateStart?: string,
    @Query('dateEnd') dateEnd?: string,
  ): Promise<ApiResponseDto<any>> {
    const telemetry = await this.driversService.getDriverTelemetry(
      sessionKey,
      driverNumber,
      dateStart,
      dateEnd,
    );

    return {
      success: true,
      data: telemetry,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('session/:sessionKey/driver/:driverNumber/laps')
  @ApiOperation({ summary: 'Get driver laps', description: 'Retrieve lap data for a specific driver' })
  @ApiParam({ name: 'sessionKey', description: 'Session identifier' })
  @ApiParam({ name: 'driverNumber', description: 'Driver racing number' })
  @ApiQuery({ name: 'lapNumber', required: false, description: 'Filter by specific lap number' })
  @ApiResponse({ status: 200, description: 'Lap data retrieved successfully' })
  async getDriverLaps(
    @Param('sessionKey', ParseIntPipe) sessionKey: number,
    @Param('driverNumber', ParseIntPipe) driverNumber: number,
    @Query('lapNumber') lapNumber?: number,
  ): Promise<ApiResponseDto<any>> {
    const laps = await this.driversService.getDriverLaps(
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

  @Get('session/:sessionKey/driver/:driverNumber/info')
  @ApiOperation({ summary: 'Get driver info', description: 'Retrieve detailed information about a specific driver' })
  @ApiParam({ name: 'sessionKey', description: 'Session identifier' })
  @ApiParam({ name: 'driverNumber', description: 'Driver racing number' })
  @ApiResponse({ status: 200, description: 'Driver info retrieved successfully' })
  async getDriverInfo(
    @Param('sessionKey', ParseIntPipe) sessionKey: number,
    @Param('driverNumber', ParseIntPipe) driverNumber: number,
  ): Promise<ApiResponseDto<any>> {
    const info = await this.driversService.getDriverInfo(
      sessionKey,
      driverNumber,
    );

    return {
      success: true,
      data: info,
      timestamp: new Date().toISOString(),
    };
  }
}
