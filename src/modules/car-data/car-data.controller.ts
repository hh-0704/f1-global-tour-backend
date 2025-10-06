import { Controller, Get, Param, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { CarDataService } from './car-data.service';
import { ApiResponseDto } from '../../common/dto/api-response.dto';

@ApiTags('car-data')
@Controller('car-data')
export class CarDataController {
  constructor(private readonly carDataService: CarDataService) {}

  @Get('session/:sessionKey/driver/:driverNumber')
  @ApiOperation({ summary: 'Get driver telemetry', description: 'Retrieve telemetry data (speed, throttle, brake, DRS) for a specific driver' })
  @ApiParam({ name: 'sessionKey', description: 'Session identifier' })
  @ApiParam({ name: 'driverNumber', description: 'Driver racing number' })
  @ApiQuery({ name: 'date', required: false, description: 'Filter by specific date (ISO 8601)' })
  @ApiResponse({ status: 200, description: 'Telemetry data retrieved successfully' })
  async getDriverTelemetry(
    @Param('sessionKey', ParseIntPipe) sessionKey: number,
    @Param('driverNumber', ParseIntPipe) driverNumber: number,
    @Query('date') date?: string,
  ): Promise<ApiResponseDto<any>> {
    const telemetry = await this.carDataService.getDriverTelemetry(
      sessionKey,
      driverNumber,
      date,
    );

    return {
      success: true,
      data: telemetry,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('session/:sessionKey/telemetry')
  @ApiOperation({ summary: 'Get session telemetry', description: 'Retrieve telemetry data for multiple drivers in a session' })
  @ApiParam({ name: 'sessionKey', description: 'Session identifier' })
  @ApiQuery({ name: 'date', required: false, description: 'Filter by specific date (ISO 8601)' })
  @ApiQuery({ name: 'drivers', required: false, description: 'Comma-separated driver numbers (e.g., "1,44,63")' })
  @ApiResponse({ status: 200, description: 'Session telemetry retrieved successfully' })
  async getSessionTelemetry(
    @Param('sessionKey', ParseIntPipe) sessionKey: number,
    @Query('date') date?: string,
    @Query('drivers') drivers?: string,
  ): Promise<ApiResponseDto<any>> {
    const driverNumbers = drivers
      ? drivers.split(',').map((num) => parseInt(num.trim()))
      : undefined;

    const telemetry = await this.carDataService.getSessionTelemetry(
      sessionKey,
      date,
      driverNumbers,
    );

    return {
      success: true,
      data: telemetry,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('session/:sessionKey/driver/:driverNumber/speed-analysis')
  @ApiOperation({ summary: 'Get speed analysis', description: 'Analyze speed data for a specific driver' })
  @ApiParam({ name: 'sessionKey', description: 'Session identifier' })
  @ApiParam({ name: 'driverNumber', description: 'Driver racing number' })
  @ApiResponse({ status: 200, description: 'Speed analysis retrieved successfully' })
  async getSpeedAnalysis(
    @Param('sessionKey', ParseIntPipe) sessionKey: number,
    @Param('driverNumber', ParseIntPipe) driverNumber: number,
  ): Promise<ApiResponseDto<any>> {
    const analysis = await this.carDataService.getSpeedAnalysis(
      sessionKey,
      driverNumber,
    );

    return {
      success: true,
      data: analysis,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('session/:sessionKey/driver/:driverNumber/gear-analysis')
  @ApiOperation({ summary: 'Get gear analysis', description: 'Analyze gear usage patterns for a specific driver' })
  @ApiParam({ name: 'sessionKey', description: 'Session identifier' })
  @ApiParam({ name: 'driverNumber', description: 'Driver racing number' })
  @ApiResponse({ status: 200, description: 'Gear analysis retrieved successfully' })
  async getGearAnalysis(
    @Param('sessionKey', ParseIntPipe) sessionKey: number,
    @Param('driverNumber', ParseIntPipe) driverNumber: number,
  ): Promise<ApiResponseDto<any>> {
    const analysis = await this.carDataService.getGearAnalysis(
      sessionKey,
      driverNumber,
    );

    return {
      success: true,
      data: analysis,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('session/:sessionKey/driver/:driverNumber/drs-usage')
  @ApiOperation({ summary: 'Get DRS usage', description: 'Retrieve DRS (Drag Reduction System) usage statistics' })
  @ApiParam({ name: 'sessionKey', description: 'Session identifier' })
  @ApiParam({ name: 'driverNumber', description: 'Driver racing number' })
  @ApiResponse({ status: 200, description: 'DRS usage data retrieved successfully' })
  async getDRSUsage(
    @Param('sessionKey', ParseIntPipe) sessionKey: number,
    @Param('driverNumber', ParseIntPipe) driverNumber: number,
  ): Promise<ApiResponseDto<any>> {
    const drsUsage = await this.carDataService.getDRSUsage(
      sessionKey,
      driverNumber,
    );

    return {
      success: true,
      data: drsUsage,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('session/:sessionKey/comparison')
  @ApiOperation({ summary: 'Compare driver telemetry', description: 'Compare telemetry data between two drivers' })
  @ApiParam({ name: 'sessionKey', description: 'Session identifier' })
  @ApiQuery({ name: 'driver1', required: true, description: 'First driver racing number' })
  @ApiQuery({ name: 'driver2', required: true, description: 'Second driver racing number' })
  @ApiQuery({ name: 'date', required: false, description: 'Filter by specific date (ISO 8601)' })
  @ApiResponse({ status: 200, description: 'Driver comparison retrieved successfully' })
  async getDriverComparison(
    @Param('sessionKey', ParseIntPipe) sessionKey: number,
    @Query('driver1', ParseIntPipe) driver1: number,
    @Query('driver2', ParseIntPipe) driver2: number,
    @Query('date') date?: string,
  ): Promise<ApiResponseDto<any>> {
    const comparison = await this.carDataService.getDriverComparison(
      sessionKey,
      driver1,
      driver2,
      date,
    );

    return {
      success: true,
      data: comparison,
      timestamp: new Date().toISOString(),
    };
  }
}
