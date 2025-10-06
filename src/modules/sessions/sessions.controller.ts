import { Controller, Get, Query, Param, Post } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { ApiResponseDto } from '../../common/dto/api-response.dto';

@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get()
  async getSessions(
    @Query('country') country?: string,
    @Query('year') year?: string,
  ) {
    try {
      const sessions = await this.sessionsService.getSessions(country, year);
      return ApiResponseDto.success(sessions);
    } catch (error) {
      throw error;
    }
  }

  @Get(':sessionKey/drivers')
  async getSessionDrivers(@Param('sessionKey') sessionKey: string) {
    try {
      const drivers = await this.sessionsService.getSessionDrivers(
        Number(sessionKey),
      );
      return ApiResponseDto.success(drivers);
    } catch (error) {
      throw error;
    }
  }

  @Post(':sessionKey/start-replay')
  async startReplay(@Param('sessionKey') sessionKey: string) {
    try {
      const result = await this.sessionsService.startReplay(Number(sessionKey));
      return ApiResponseDto.success(result);
    } catch (error) {
      throw error;
    }
  }
}
