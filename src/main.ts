import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000).catch((err) => {
    console.error('Ошибка запуска сервера:', err);
    process.exit(1);
  });
}

bootstrap();
