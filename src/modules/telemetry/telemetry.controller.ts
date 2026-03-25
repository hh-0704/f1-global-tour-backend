import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { TelemetryService } from './telemetry.service';
import { ApiResponseDto } from '../../common/dto/api-response.dto';

@ApiTags('telemetry')
@Controller('sessions')
export class TelemetryController {
  constructor(private readonly telemetryService: TelemetryService) {}

  @Get(':sessionKey/telemetry/:driverNumber')
  @ApiOperation({
    summary: '드라이버 텔레메트리 조회',
    description: [
      '특정 드라이버의 텔레메트리 데이터를 0.5초 간격 프레임으로 반환.',
      'speed, gear, throttle, brake, DRS 상태를 포함.',
      'OpenF1 car_data를 다운샘플링하여 제공하며, 10분간 인메모리 캐시됩니다.',
      '⚠️ 첫 요청 시 OpenF1 API 호출로 수 초 소요될 수 있습니다.',
    ].join(' '),
  })
  @ApiParam({ name: 'sessionKey', description: '세션 고유 식별자' })
  @ApiParam({ name: 'driverNumber', description: '드라이버 번호' })
  @ApiResponse({ status: 200, description: '텔레메트리 데이터 반환 성공' })
  async getDriverTelemetry(
    @Param('sessionKey', ParseIntPipe) sessionKey: number,
    @Param('driverNumber', ParseIntPipe) driverNumber: number,
  ) {
    const data = await this.telemetryService.getDriverTelemetry(
      sessionKey,
      driverNumber,
    );
    return ApiResponseDto.success(data);
  }
}
