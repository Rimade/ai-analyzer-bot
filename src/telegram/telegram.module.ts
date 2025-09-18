import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UsersModule } from '../users/users.module';
import { AnalysisModule } from '../analysis/analysis.module';
import { TelegramService } from './telegram.service';

@Module({
  imports: [ConfigModule, UsersModule, AnalysisModule],
  providers: [TelegramService],
})
export class TelegramModule {}
