import { Controller, Get, Param, Query, ParseIntPipe } from '@nestjs/common';
import { RaceControlService } from './race-control.service';
import { ApiResponseDto } from '../../common/dto/api-response.dto';

@Controller('race-control')
export class RaceControlController {
  constructor(private readonly raceControlService: RaceControlService) {}

  @Get('session/:sessionKey')
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

  @Get('session/:sessionKey/flags')
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

  @Get('session/:sessionKey/incidents')
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

  @Get('session/:sessionKey/safety-car')
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

  @Get('session/:sessionKey/timeline')
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

  @Get('session/:sessionKey/penalties')
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

  @Get('session/:sessionKey/drs-zones')
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
}
