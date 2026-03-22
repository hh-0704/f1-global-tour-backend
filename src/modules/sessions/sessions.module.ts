import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';
import { RaceFlagsService } from './race-flags.service';

@Module({
  imports: [CommonModule],
  controllers: [SessionsController],
  providers: [SessionsService, RaceFlagsService],
  exports: [SessionsService, RaceFlagsService],
})
export class SessionsModule {}
