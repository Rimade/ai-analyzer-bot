import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf } from 'telegraf';
import type { Context } from 'telegraf';
import { UsersService } from '../users/users.service';
import { AnalysisService } from '../analysis/analysis.service';
import { AnalysisType } from '@prisma/client';

@Injectable()
export class TelegramService implements OnModuleInit {
  private bot: Telegraf;

  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
    private analysisService: AnalysisService,
  ) {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN not found in environment');
    }
    this.bot = new Telegraf(token);
  }

  async onModuleInit() {
    this.setupHandlers();
    await this.bot.launch();
    console.log('Telegram bot launched');
  }

  private setupHandlers() {
    // /start command
    this.bot.start((ctx: Context) => {
      ctx.reply('Welcome to AI Life Analyzer! Send a photo to analyze it.');
    });

    // /analyze command (prompt for photo)
    this.bot.command('analyze', (ctx: Context) => {
      ctx.reply(
        'Please send a photo to analyze. You can choose mode: MERCH, FOOD, CHARACTER, or GENERAL.',
      );
    });

    // Handle photo messages for analysis (basic: assume GENERAL type)
    this.bot.on('photo', async (ctx: Context) => {
      const user = ctx.from;
      if ('photo' in ctx.message) {
        const photo = ctx.message.photo;
        const fileId = photo[photo.length - 1].file_id; // Largest photo

        try {
          // Find or create user
          const dbUser = await this.usersService.findOrCreateUser(
            user.id.toString(),
            user.username,
            user.first_name,
            user.last_name,
          );

          // Create analysis record (type GENERAL for basic)
          await this.analysisService.createAnalysis(
            dbUser.id,
            AnalysisType.GENERAL,
            fileId,
          );

          ctx.reply('Photo saved, analysis coming soon');
        } catch (error) {
          console.error('Error processing photo:', error);
          ctx.reply('Sorry, an error occurred while processing your photo.');
        }
      }
    });

    // Graceful stop
    process.once('SIGINT', () => this.bot.stop('SIGINT'));
    process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
  }
}
