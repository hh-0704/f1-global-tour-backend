import { Controller, Get, Param, Query, ParseIntPipe } from '@nestjs/common';
import { CarDataService } from './car-data.service';
import { ApiResponseDto } from '../../common/dto/api-response.dto';

@Controller('car-data')
export class CarDataController {
  constructor(private readonly carDataService: CarDataService) {}

  @Get('session/:sessionKey/driver/:driverNumber')
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
  async getSessionTelemetry(
    @Param('sessionKey', ParseIntPipe) sessionKey: number,
    @Query('date') date?: string,
    @Query('drivers') drivers?: string,
  ): Promise<ApiResponseDto<any>> {
    const driverNumbers = drivers
      ? drivers.split(',').map(num => parseInt(num.trim()))
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