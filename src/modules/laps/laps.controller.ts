import { Controller, Get, Param, Query, ParseIntPipe } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { LapsService } from './laps.service';
import { ApiResponseDto } from '../../common/dto/api-response.dto';
import { TransformedLap } from './interfaces/lap.interface';

@ApiTags('laps')
@Controller('laps')
export class LapsController {
  constructor(private readonly lapsService: LapsService) {}

  @Get('session/:sessionKey')
  @ApiOperation({
    summary: '세션 랩 데이터 조회',
    description: '세션의 전체 랩 데이터 반환. lapNumber 지정 시 해당 랩만 반환',
  })
  @ApiParam({ name: 'sessionKey', description: '세션 고유 식별자' })
  @ApiQuery({
    name: 'lapNumber',
    required: false,
    description: '특정 랩 번호 필터',
  })
  @ApiResponse({ status: 200, description: '랩 데이터 반환 성공' })
  async getSessionLaps(
    @Param('sessionKey', ParseIntPipe) sessionKey: number,
    @Query('lapNumber', new ParseIntPipe({ optional: true }))
    lapNumber?: number,
  ): Promise<ApiResponseDto<TransformedLap[]>> {
    return ApiResponseDto.success(
      await this.lapsService.getSessionLaps(sessionKey, lapNumber),
    );
  }
}
