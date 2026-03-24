import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service';
import type { ApiInfo } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'API 정보', description: 'API 이름, 버전, 문서 경로 반환' })
  @ApiResponse({ status: 200, description: 'API 정보 반환 성공' })
  getApiInfo(): ApiInfo {
    return this.appService.getApiInfo();
  }
}
