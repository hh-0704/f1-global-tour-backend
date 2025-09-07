import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
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
  
  const port = process.env.PORT || 4000;
  await app.listen(port);
  
  console.log(`🏎️  F1 Global Tour Backend is running on port ${port}`);
  console.log(`📊 API Documentation: http://localhost:${port}/api/v1`);
}

bootstrap();
