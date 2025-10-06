import { Controller, Get, Param, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { StintsService } from './stints.service';
import { ApiResponseDto } from '../../common/dto/api-response.dto';

@ApiTags('stints')
@Controller('stints')
export class StintsController {
  constructor(private readonly stintsService: StintsService) {}

  @Get('session/:sessionKey')
  @ApiOperation({ summary: 'Get session stints', description: 'Retrieve all tire stints for a session' })
  @ApiParam({ name: 'sessionKey', description: 'Session identifier' })
  @ApiResponse({ status: 200, description: 'Stints retrieved successfully' })
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
  @ApiOperation({ summary: 'Get driver stints', description: 'Retrieve tire stints for a specific driver' })
  @ApiParam({ name: 'sessionKey', description: 'Session identifier' })
  @ApiParam({ name: 'driverNumber', description: 'Driver racing number' })
  @ApiResponse({ status: 200, description: 'Driver stints retrieved successfully' })
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
  @ApiOperation({ summary: 'Get tire strategy', description: 'Retrieve tire strategy overview for all drivers' })
  @ApiParam({ name: 'sessionKey', description: 'Session identifier' })
  @ApiResponse({ status: 200, description: 'Tire strategy retrieved successfully' })
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
  @ApiOperation({ summary: 'Get pit stops', description: 'Retrieve pit stop information for the session' })
  @ApiParam({ name: 'sessionKey', description: 'Session identifier' })
  @ApiQuery({ name: 'driverNumber', required: false, description: 'Filter by driver racing number' })
  @ApiResponse({ status: 200, description: 'Pit stops retrieved successfully' })
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
  @ApiOperation({ summary: 'Get tire performance', description: 'Analyze tire performance by compound' })
  @ApiParam({ name: 'sessionKey', description: 'Session identifier' })
  @ApiQuery({ name: 'compound', required: false, description: 'Filter by tire compound (SOFT, MEDIUM, HARD)' })
  @ApiResponse({ status: 200, description: 'Tire performance retrieved successfully' })
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
  @ApiOperation({ summary: 'Compare driver stints', description: 'Compare stint performance between two drivers' })
  @ApiParam({ name: 'sessionKey', description: 'Session identifier' })
  @ApiQuery({ name: 'driver1', required: true, description: 'First driver racing number' })
  @ApiQuery({ name: 'driver2', required: true, description: 'Second driver racing number' })
  @ApiResponse({ status: 200, description: 'Stint comparison retrieved successfully' })
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
  @ApiOperation({ summary: 'Get tire degradation', description: 'Analyze tire degradation over stint duration' })
  @ApiParam({ name: 'sessionKey', description: 'Session identifier' })
  @ApiQuery({ name: 'driverNumber', required: false, description: 'Filter by driver racing number' })
  @ApiResponse({ status: 200, description: 'Tire degradation retrieved successfully' })
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
