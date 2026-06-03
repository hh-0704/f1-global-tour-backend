import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * 전역 모듈 — AppModule 에 한 번 등록하면 어디서든 PrismaService 주입 가능.
 * 캐시 레이어(CachedOpenF1ClientService)·가공 결과 서비스가 공통으로 사용.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
