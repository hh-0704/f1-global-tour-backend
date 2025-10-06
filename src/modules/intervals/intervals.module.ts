import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { IntervalsController } from './intervals.controller';
import { IntervalsService } from './intervals.service';

@Module({
  imports: [CommonModule],
  controllers: [IntervalsController],
  providers: [IntervalsService],
  exports: [IntervalsService],
})
export class IntervalsModule {}
