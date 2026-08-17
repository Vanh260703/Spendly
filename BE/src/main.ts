import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';

async function bootstrap() {
  const app = configureApp(await NestFactory.create(AppModule));

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);

  Logger.log(`Spendly API chạy tại http://localhost:${port}/api/v1`, 'Bootstrap');
}

void bootstrap();
