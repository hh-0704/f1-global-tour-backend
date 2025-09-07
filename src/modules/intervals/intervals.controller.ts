import { Controller, Get, Param, Query, ParseIntPipe } from '@nestjs/common';
import { IntervalsService } from './intervals.service';
import { ApiResponseDto } from '../../common/dto/api-response.dto';

@Controller('intervals')
export class IntervalsController {
  constructor(private readonly intervalsService: IntervalsService) {}

  @Get('session/:sessionKey')
  async getSessionIntervals(
    @Param('sessionKey', ParseIntPipe) sessionKey: number,
    @Query('date') date?: string,
  ): Promise<ApiResponseDto<any>> {
    const intervals = await this.intervalsService.getSessionIntervals(sessionKey, date);
    
    return {
      success: true,
      data: intervals,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('session/:sessionKey/live')
  async getLiveIntervals(
    @Param('sessionKey', ParseIntPipe) sessionKey: number,
  ): Promise<ApiResponseDto<any>> {
    const liveIntervals = await this.intervalsService.getLiveIntervals(sessionKey);
    
    return {
      success: true,
      data: liveIntervals,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('session/:sessionKey/standings')
  async getStandings(
    @Param('sessionKey', ParseIntPipe) sessionKey: number,
    @Query('date') date?: string,
  ): Promise<ApiResponseDto<any>> {
    const standings = await this.intervalsService.getStandings(sessionKey, date);
    
    return {
      success: true,
      data: standings,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('session/:sessionKey/driver/:driverNumber/gaps')
  async getDriverGaps(
    @Param('sessionKey', ParseIntPipe) sessionKey: number,
    @Param('driverNumber', ParseIntPipe) driverNumber: number,
  ): Promise<ApiResponseDto<any>> {
    const gaps = await this.intervalsService.getDriverGaps(sessionKey, driverNumber);
    
    return {
      success: true,
      data: gaps,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('session/:sessionKey/history')
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