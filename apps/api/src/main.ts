import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  // rawBody: true — Supabase Hook 서명 검증에 원본 body 필요
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // CORS — 프론트엔드(web) 및 관리자(admin) 요청 허용
  app.enableCors({
    origin: [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5175',
      'http://localhost:5176',
      process.env.WEB_URL ?? '',
      process.env.ADMIN_URL ?? '',
    ].filter(Boolean),
    credentials: true,
  });

  // 전역 API prefix
  app.setGlobalPrefix('api');

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  Logger.log(`🚀 sofar API running on http://localhost:${port}/api`);
}

bootstrap().catch((err) => {
  Logger.error('Failed to start sofar API', err);
});
