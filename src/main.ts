import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import compression from 'compression';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable gzip compression for better performance
  app.use(
    compression({
      filter: (req, res) => {
        if (req.headers['x-no-compression']) {
          return false;
        }
        return true;
      },
      threshold: 1024, // Only compress responses > 1KB
      level: 6, // Compression level (1-9, 6 is good balance)
    }),
  );

  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe());

  // CORS configuration for F1 Global Tour frontend
  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // API prefix
  app.setGlobalPrefix('api/v1');

  // Swagger configuration
  const config = new DocumentBuilder()
    .setTitle('F1 Global Tour API')
    .setDescription('OpenF1 API 프록시 서버. 세션 선택 → driver-timings 한 번 호출로 전체 리플레이 프레임 수신.')
    .setVersion('1.0')
    .addTag('sessions', '세션 목록, 드라이버 조회, 리플레이 프레임 계산')
    .addTag('laps', '랩 데이터 조회')
    .addTag('health', 'Circuit Breaker 상태 및 헬스체크')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 4000;
  await app.listen(port);

  console.log(`🏎️  F1 Global Tour Backend is running on port ${port}`);
  console.log(`📊 API Documentation: http://localhost:${port}/api/docs`);
}

bootstrap();
