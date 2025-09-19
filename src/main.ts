import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { TelegramService } from './telegram/telegram.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Setup Telegram webhook
  const telegramService = app.get(TelegramService);
  app.use('/webhook', telegramService.bot.webhookCallback('/webhook'));

  await app.listen(process.env.PORT ?? 3000).catch((err) => {
    console.error('Ошибка запуска сервера:', err);
    process.exit(1);
  });

  console.log(`Server running on port ${process.env.PORT ?? 3000}`);
  console.log('Telegram webhook endpoint: /webhook');
}

bootstrap();
