import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';

@Module({
  imports: [CommonModule],
  controllers: [DriversController],
  providers: [DriversService],
  exports: [DriversService],
})
export class DriversModule {}