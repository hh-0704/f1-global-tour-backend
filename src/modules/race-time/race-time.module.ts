import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { RaceTimeService } from './race-time.service';

/**
 * race-time 모듈 — raceStartMs 단일 기준(§6). positions/timings/laps 0점 공유.
 * (app.module 등록은 Phase 4 에서 PositionsModule 과 함께.)
 */
@Module({
  imports: [CommonModule],
  providers: [RaceTimeService],
  exports: [RaceTimeService],
})
export class RaceTimeModule {}
