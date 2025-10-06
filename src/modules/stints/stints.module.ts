import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { StintsController } from './stints.controller';
import { StintsService } from './stints.service';

@Module({
  imports: [CommonModule],
  controllers: [StintsController],
  providers: [StintsService],
  exports: [StintsService],
})
export class StintsModule {}
