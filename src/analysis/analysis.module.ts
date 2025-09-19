import { Module } from '@nestjs/common';
import { AnalysisService } from './analysis.service';
import { AnalysisController } from './analysis.controller';
import { OpenAIService } from './openai.service';
import { UsersModule } from '../users/users.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, UsersModule],
  providers: [AnalysisService, OpenAIService],
  controllers: [AnalysisController],
  exports: [AnalysisService, OpenAIService],
})
export class AnalysisModule {}
