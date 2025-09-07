import { Controller, Get, Param, Query, ParseIntPipe } from '@nestjs/common';
import { LapsService } from './laps.service';
import { ApiResponseDto } from '../../common/dto/api-response.dto';

@Controller('laps')
export class LapsController {
  constructor(private readonly lapsService: LapsService) {}

  @Get('session/:sessionKey')
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
  async getDriverLaps(
    @Param('sessionKey', ParseIntPipe) sessionKey: number,
    @Param('driverNumber', ParseIntPipe) driverNumber: number,
    @Query('lapNumber') lapNumber?: number,
  ): Promise<ApiResponseDto<any>> {
    const laps = await this.lapsService.getDriverLaps(sessionKey, driverNumber, lapNumber);
    
    return {
      success: true,
      data: laps,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('session/:sessionKey/fastest')
  async getFastestLaps(
    @Param('sessionKey', ParseIntPipe) sessionKey: number,
    @Query('limit') limit?: number,
  ): Promise<ApiResponseDto<any>> {
    const fastestLaps = await this.lapsService.getFastestLaps(sessionKey, limit);
    
    return {
      success: true,
      data: fastestLaps,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('session/:sessionKey/analysis')
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