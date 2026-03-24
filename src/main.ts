import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import compression from 'compression';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Enable gzip compression (responses > 1KB, level 6)
  app.use(compression({ threshold: 1024, level: 6 }));

  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe());

  // CORS configuration
  app.enableCors({
    origin: configService.get<string>('cors.origin', 'http://localhost:3000'),
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // API prefix
  app.setGlobalPrefix('api/v1');

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('F1 Global Tour API')
    .setDescription('OpenF1 API 프록시 서버. 세션 선택 → driver-timings 한 번 호출로 전체 리플레이 프레임 수신.')
    .setVersion('1.0')
    .addTag('sessions', '세션 목록, 드라이버 조회, 리플레이 프레임 계산')
    .addTag('laps', '랩 데이터 조회')
    .addTag('telemetry', '드라이버 텔레메트리 조회')
    .addTag('health', 'Circuit Breaker 상태 및 헬스체크')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  const port = configService.get<number>('port', 4000);
  await app.listen(port);

  logger.log(`F1 Global Tour Backend is running on port ${port}`);
  logger.log(`API Documentation: http://localhost:${port}/api/docs`);
}

bootstrap();
