import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';
import { UsersModule } from './users/users.module';
import { AnalysisModule } from './analysis/analysis.module';
import { PaymentsModule } from './payments/payments.module';
import { TelegramModule } from './telegram/telegram.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        DATABASE_URL: Joi.string().uri().required(),
        BOT_TOKEN: Joi.string().optional(),
        TELEGRAM_BOT_TOKEN: Joi.string().optional(),
        OPENAI_API_KEY: Joi.string().optional(),
        FREE_ATTEMPTS: Joi.number().integer().min(0).default(5),
        STRIPE_SECRET_KEY: Joi.string().optional(),
        YOOKASSA_SECRET_KEY: Joi.string().optional(),
        PRO_SUBSCRIPTION_PRICE: Joi.number().default(299),
        NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
        PORT: Joi.number().default(3000),
      }).xor('BOT_TOKEN', 'TELEGRAM_BOT_TOKEN'),
    }),
    PrismaModule,
    UsersModule,
    AnalysisModule,
    PaymentsModule,
    TelegramModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
