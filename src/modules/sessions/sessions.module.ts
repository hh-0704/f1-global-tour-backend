import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { PositionsModule } from '../positions/positions.module';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';
import { RaceFlagsService } from './race-flags.service';

// PositionsModule import → start-replay 프리워밍에서 PositionsService(positions 캐시) 사용.
@Module({
  imports: [CommonModule, PositionsModule],
  controllers: [SessionsController],
  providers: [SessionsService, RaceFlagsService],
  exports: [SessionsService, RaceFlagsService],
})
export class SessionsModule {}
