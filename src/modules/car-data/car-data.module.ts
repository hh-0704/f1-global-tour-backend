import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { CarDataController } from './car-data.controller';
import { CarDataService } from './car-data.service';

@Module({
  imports: [CommonModule],
  controllers: [CarDataController],
  providers: [CarDataService],
  exports: [CarDataService],
})
export class CarDataModule {}