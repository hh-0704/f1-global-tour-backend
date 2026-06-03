import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Prisma 연결 수명주기 관리. NestJS 모듈 초기화 시 connect, 종료 시 disconnect.
 * plan.md 1단계의 RDB 영구 저장(source of truth) 진입점.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Prisma 연결 완료');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
