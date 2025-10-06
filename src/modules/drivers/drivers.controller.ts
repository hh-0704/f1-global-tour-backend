import { Controller, Get, Param, Query, ParseIntPipe } from '@nestjs/common';
import { DriversService } from './drivers.service';
import { ApiResponseDto } from '../../common/dto/api-response.dto';

@Controller('drivers')
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Get('session/:sessionKey')
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
