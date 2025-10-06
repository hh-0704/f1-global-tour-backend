import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { LapsController } from './laps.controller';
import { LapsService } from './laps.service';

@Module({
  imports: [CommonModule],
  controllers: [LapsController],
  providers: [LapsService],
  exports: [LapsService],
})
export class LapsModule {}
