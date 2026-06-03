import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { CalibrationModule } from '../calibration/calibration.module';
import { RaceTimeModule } from '../race-time/race-time.module';
import { PositionsController } from './positions.controller';
import { PositionsService } from './positions.service';
import { PositionPipelineService } from './position-pipeline.service';

/**
 * ★ positions 모듈 (핵심). GET /sessions/:sk/positions.
 *
 * 의존: common(OpenF1 클라이언트) + calibration(좌표변환/도로스냅) + race-time(0점 기준).
 * 이 모듈만 app.module 에 등록하면 calibration/race-time 도 함께 주입된다.
 */
@Module({
  imports: [CommonModule, CalibrationModule, RaceTimeModule],
  controllers: [PositionsController],
  providers: [PositionsService, PositionPipelineService],
  exports: [PositionsService],
})
export class PositionsModule {}
