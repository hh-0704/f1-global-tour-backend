import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { RaceControlController } from './race-control.controller';
import { RaceControlService } from './race-control.service';

@Module({
  imports: [CommonModule],
  controllers: [RaceControlController],
  providers: [RaceControlService],
  exports: [RaceControlService],
})
export class RaceControlModule {}
