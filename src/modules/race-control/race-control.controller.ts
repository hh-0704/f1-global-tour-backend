import { Controller, Get, Param, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { RaceControlService } from './race-control.service';
import { ApiResponseDto } from '../../common/dto/api-response.dto';

@ApiTags('race-control')
@Controller('race-control')
export class RaceControlController {
  constructor(private readonly raceControlService: RaceControlService) {}

  @Get('session/:sessionKey')
  @ApiOperation({ summary: 'Get race control data', description: 'Retrieve all race control information for a session' })
  @ApiParam({ name: 'sessionKey', description: 'Session identifier' })
  @ApiQuery({ name: 'date', required: false, description: 'Filter by specific date (ISO 8601)' })
  @ApiResponse({ status: 200, description: 'Race control data retrieved successfully' })
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
  @ApiOperation({ summary: 'Get flags', description: 'Retrieve flag information (yellow, red, green, etc.)' })
  @ApiParam({ name: 'sessionKey', description: 'Session identifier' })
  @ApiQuery({ name: 'date', required: false, description: 'Filter by specific date (ISO 8601)' })
  @ApiResponse({ status: 200, description: 'Flags retrieved successfully' })
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
  @ApiOperation({ summary: 'Get incidents', description: 'Retrieve race incidents and investigations' })
  @ApiParam({ name: 'sessionKey', description: 'Session identifier' })
  @ApiQuery({ name: 'date', required: false, description: 'Filter by specific date (ISO 8601)' })
  @ApiResponse({ status: 200, description: 'Incidents retrieved successfully' })
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
  @ApiOperation({ summary: 'Get safety car periods', description: 'Retrieve safety car and virtual safety car periods' })
  @ApiParam({ name: 'sessionKey', description: 'Session identifier' })
  @ApiQuery({ name: 'date', required: false, description: 'Filter by specific date (ISO 8601)' })
  @ApiResponse({ status: 200, description: 'Safety car periods retrieved successfully' })
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
  @ApiOperation({ summary: 'Get race timeline', description: 'Retrieve chronological timeline of race events' })
  @ApiParam({ name: 'sessionKey', description: 'Session identifier' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date filter (ISO 8601)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date filter (ISO 8601)' })
  @ApiResponse({ status: 200, description: 'Race timeline retrieved successfully' })
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
  @ApiOperation({ summary: 'Get penalties', description: 'Retrieve penalties issued during the session' })
  @ApiParam({ name: 'sessionKey', description: 'Session identifier' })
  @ApiQuery({ name: 'driverNumber', required: false, description: 'Filter by driver racing number' })
  @ApiResponse({ status: 200, description: 'Penalties retrieved successfully' })
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
  @ApiOperation({ summary: 'Get DRS zones', description: 'Retrieve DRS zone locations for the circuit' })
  @ApiParam({ name: 'sessionKey', description: 'Session identifier' })
  @ApiResponse({ status: 200, description: 'DRS zones retrieved successfully' })
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

  @Get(':sessionKey')
  @ApiOperation({ summary: 'Get race control data (alias)', description: 'Alias endpoint for race control data. Supports optional category filtering (e.g., category=Flag).' })
  @ApiParam({ name: 'sessionKey', description: 'Session identifier' })
  @ApiQuery({ name: 'category', required: false, description: 'Filter by message category (e.g., Flag, SafetyCar, Drs)' })
  @ApiResponse({ status: 200, description: 'Race control data retrieved successfully' })
  async getSessionRaceControlDirect(
    @Param('sessionKey', ParseIntPipe) sessionKey: number,
    @Query('category') category?: string,
  ): Promise<ApiResponseDto<any>> {
    const raceControl = await this.raceControlService.getSessionRaceControlByCategory(
      sessionKey,
      category,
    );

    return {
      success: true,
      data: raceControl,
      timestamp: new Date().toISOString(),
    };
  }
}
