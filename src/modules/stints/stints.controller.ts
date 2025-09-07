import { Controller, Get, Param, Query, ParseIntPipe } from '@nestjs/common';
import { StintsService } from './stints.service';
import { ApiResponseDto } from '../../common/dto/api-response.dto';

@Controller('stints')
export class StintsController {
  constructor(private readonly stintsService: StintsService) {}

  @Get('session/:sessionKey')
  async getSessionStints(
    @Param('sessionKey', ParseIntPipe) sessionKey: number,
  ): Promise<ApiResponseDto<any>> {
    const stints = await this.stintsService.getSessionStints(sessionKey);

    return {
      success: true,
      data: stints,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('session/:sessionKey/driver/:driverNumber')
  async getDriverStints(
    @Param('sessionKey', ParseIntPipe) sessionKey: number,
    @Param('driverNumber', ParseIntPipe) driverNumber: number,
  ): Promise<ApiResponseDto<any>> {
    const driverStints = await this.stintsService.getDriverStints(
      sessionKey,
      driverNumber,
    );

    return {
      success: true,
      data: driverStints,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('session/:sessionKey/tire-strategy')
  async getTireStrategy(
    @Param('sessionKey', ParseIntPipe) sessionKey: number,
  ): Promise<ApiResponseDto<any>> {
    const tireStrategy = await this.stintsService.getTireStrategy(sessionKey);

    return {
      success: true,
      data: tireStrategy,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('session/:sessionKey/pit-stops')
  async getPitStops(
    @Param('sessionKey', ParseIntPipe) sessionKey: number,
    @Query('driverNumber', ParseIntPipe) driverNumber?: number,
  ): Promise<ApiResponseDto<any>> {
    const pitStops = await this.stintsService.getPitStops(
      sessionKey,
      driverNumber,
    );

    return {
      success: true,
      data: pitStops,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('session/:sessionKey/tire-performance')
  async getTirePerformance(
    @Param('sessionKey', ParseIntPipe) sessionKey: number,
    @Query('compound') compound?: string,
  ): Promise<ApiResponseDto<any>> {
    const tirePerformance = await this.stintsService.getTirePerformance(
      sessionKey,
      compound,
    );

    return {
      success: true,
      data: tirePerformance,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('session/:sessionKey/stint-comparison')
  async getStintComparison(
    @Param('sessionKey', ParseIntPipe) sessionKey: number,
    @Query('driver1', ParseIntPipe) driver1: number,
    @Query('driver2', ParseIntPipe) driver2: number,
  ): Promise<ApiResponseDto<any>> {
    const comparison = await this.stintsService.getStintComparison(
      sessionKey,
      driver1,
      driver2,
    );

    return {
      success: true,
      data: comparison,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('session/:sessionKey/tire-degradation')
  async getTireDegradation(
    @Param('sessionKey', ParseIntPipe) sessionKey: number,
    @Query('driverNumber', ParseIntPipe) driverNumber?: number,
  ): Promise<ApiResponseDto<any>> {
    const degradation = await this.stintsService.getTireDegradation(
      sessionKey,
      driverNumber,
    );

    return {
      success: true,
      data: degradation,
      timestamp: new Date().toISOString(),
    };
  }
}