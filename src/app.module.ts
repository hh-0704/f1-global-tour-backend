import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './common/prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { ImmutableCacheInterceptor } from './common/interceptors/immutable-cache.interceptor';
import { SessionsModule } from './modules/sessions/sessions.module';
import { LapsModule } from './modules/laps/laps.module';
import { HealthModule } from './modules/health/health.module';
import { TelemetryModule } from './modules/telemetry/telemetry.module';
import { PositionsModule } from './modules/positions/positions.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    PrismaModule,
    CommonModule,
    SessionsModule,
    LapsModule,
    HealthModule,
    TelemetryModule,
    PositionsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    // 끝난 세션 응답에 HTTP immutable 캐시 헤더 부착(@ImmutableCache 가 붙은 핸들러만 동작).
    {
      provide: APP_INTERCEPTOR,
      useClass: ImmutableCacheInterceptor,
    },
  ],
})
export class AppModule {}
