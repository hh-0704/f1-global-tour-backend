import { Controller, Get, Param, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { LapsService } from './laps.service';
import { ApiResponseDto } from '../../common/dto/api-response.dto';

@ApiTags('laps')
@Controller('laps')
export class LapsController {
  constructor(private readonly lapsService: LapsService) {}

  @Get('session/:sessionKey')
  @ApiOperation({ summary: '세션 랩 데이터 조회', description: '세션의 전체 랩 데이터 반환. lapNumber 지정 시 해당 랩만 반환' })
  @ApiParam({ name: 'sessionKey', description: '세션 고유 식별자' })
  @ApiQuery({ name: 'lapNumber', required: false, description: '특정 랩 번호 필터' })
  @ApiResponse({ status: 200, description: '랩 데이터 반환 성공' })
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
}
