import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CommonModule } from './common/common.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { DriversModule } from './modules/drivers/drivers.module';
import { LapsModule } from './modules/laps/laps.module';
import { IntervalsModule } from './modules/intervals/intervals.module';
import { CarDataModule } from './modules/car-data/car-data.module';
import { RaceControlModule } from './modules/race-control/race-control.module';
import { StintsModule } from './modules/stints/stints.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    CommonModule,
    SessionsModule,
    DriversModule,
    LapsModule,
    IntervalsModule,
    CarDataModule,
    RaceControlModule,
    StintsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule {}
