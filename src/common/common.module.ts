import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { OpenF1ClientService } from './services/openf1-client.service';
import { CacheService } from './services/cache.service';
import { CachedOpenF1ClientService } from './services/cached-openf1-client.service';
import { CircuitBreakerService } from './services/circuit-breaker.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 3,
    }),
  ],
  providers: [
    CircuitBreakerService,
    OpenF1ClientService,
    CacheService,
    CachedOpenF1ClientService,
  ],
  exports: [
    CircuitBreakerService,
    OpenF1ClientService,
    CacheService,
    CachedOpenF1ClientService,
  ],
})
export class CommonModule {}
