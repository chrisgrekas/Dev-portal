import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';

async function bootstrap() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.startsWith('change-me')) {
    console.warn('⚠️  JWT_SECRET is not set to a real secret. Fine for local dev, NOT for a server.');
  }
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
  console.log(`API:     http://localhost:${port}/api/v1`);
  console.log(`Swagger: http://localhost:${port}/api/docs`);
}
bootstrap();
