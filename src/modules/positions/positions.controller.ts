import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { PositionsService } from './positions.service';
import { ApiResponseDto } from '../../common/dto/api-response.dto';
import { ImmutableCache } from '../../common/interceptors/immutable-cache.interceptor';
import { POSITIONS_LOGIC_VERSION } from '../../common/constants/logic-version';

@ApiTags('positions')
@Controller('sessions/:sessionKey/positions')
export class PositionsController {
  constructor(private readonly positionsService: PositionsService) {}

  @Get()
  @ApiOperation({
    summary: '리플레이 좌표 시계열 조회',
    description: [
      'OpenF1 /location 을 좌표 변환(affine/quad/TPS)·도로스냅·다운샘플한',
      '드라이버별 {t,lng,lat} 시계열(렌더 직전 좌표) 반환.',
      '프론트는 변환 없이 시간 보간만 수행한다.',
      '결과는 DB에 영구 캐시되며, 끝난 세션은 HTTP immutable 캐시가 적용됩니다.',
      '⚠️ 최초 요청 시 드라이버별 /location 을 순차 수집하므로 수십 초 소요될 수 있습니다(이후 캐시).',
    ].join(' '),
  })
  @ApiParam({ name: 'sessionKey', description: '세션 고유 식별자' })
  @ApiResponse({ status: 200, description: '좌표 시계열 반환 성공' })
  @ApiResponse({ status: 404, description: '캘리브레이션 없는 서킷' })
  @ImmutableCache({ tag: 'positions', version: POSITIONS_LOGIC_VERSION })
  async getPositions(@Param('sessionKey', ParseIntPipe) sessionKey: number) {
    const data = await this.positionsService.getPositions(sessionKey);
    return ApiResponseDto.success(data);
  }
}
