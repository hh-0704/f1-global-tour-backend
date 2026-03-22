import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';

@Module({
  imports: [CommonModule],
  controllers: [TelemetryController],
  providers: [TelemetryService],
  exports: [TelemetryService],
})
export class TelemetryModule {}
