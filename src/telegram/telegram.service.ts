import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf, Markup } from 'telegraf';
import { session } from 'telegraf/session';
import type { Context } from 'telegraf';

import { UsersService } from '../users/users.service';
import { AnalysisService } from '../analysis/analysis.service';
import { AnalysisType } from '@prisma/client';

interface SessionData {
  selectedType?: AnalysisType;
}

interface BotContext extends Context {
  session: SessionData;
}

@Injectable()
export class TelegramService implements OnModuleInit {
  private bot: Telegraf<BotContext>;

  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
    private analysisService: AnalysisService,
  ) {
    const token =
      this.configService.get<string>('BOT_TOKEN') ||
      this.configService.get<string>('TELEGRAM_BOT_TOKEN');

    if (!token) {
      throw new Error('BOT_TOKEN/TELEGRAM_BOT_TOKEN не найден в окружении');
    }

    this.bot = new Telegraf<BotContext>(token);
  }

  async onModuleInit() {
    this.bot.use(
      session({
        defaultSession: () => ({ selectedType: undefined }),
      }),
    );
    this.setupHandlers();

    // Не запускать бота в тестовой среде
    if (process.env.NODE_ENV !== 'test') {
      await this.bot.launch();
      console.log('Telegram bot launched');
    }

    // Graceful stop
    process.once('SIGINT', () => this.bot.stop('SIGINT'));
    process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
  }

  private getMainMenu() {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback('🔍 Анализ', 'analyze'),
        Markup.button.callback('💳 Баланс', 'balance'),
      ],
      [
        Markup.button.callback('📊 История', 'history'),
        Markup.button.callback('❓ Помощь', 'help'),
      ],
      [Markup.button.callback('⭐ Подписка Pro', 'subscribe')],
    ]);
  }

  private getAnalysisTypesMenu() {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback('👕 Merch', 'type_merch'),
        Markup.button.callback('🍔 Food', 'type_food'),
      ],
      [
        Markup.button.callback('🧑 Character', 'type_character'),
        Markup.button.callback('🌐 General', 'type_general'),
      ],
      [Markup.button.callback('🔙 Главное меню', 'main_menu')],
    ]);
  }

  private getBalanceMenu(isPro: boolean) {
    return Markup.inlineKeyboard([
      [
        isPro
          ? Markup.button.callback('✅ Pro активна', 'balance_pro')
          : Markup.button.callback('💎 Оформить Pro', 'subscribe'),
      ],
      [Markup.button.callback('🔙 Главное меню', 'main_menu')],
    ]);
  }

  private parseAnalysisType(text: string | undefined): AnalysisType {
    if (!text) return AnalysisType.GENERAL;
    const upper = text.toUpperCase();
    if (upper.includes('MERCH')) return AnalysisType.MERCH;
    if (upper.includes('FOOD')) return AnalysisType.FOOD;
    if (upper.includes('CHARACTER')) return AnalysisType.CHARACTER;
    if (upper.includes('GENERAL')) return AnalysisType.GENERAL;
    return AnalysisType.GENERAL;
  }

  private extractNote(text: string | undefined): string | undefined {
    if (!text) return undefined;
    // Убираем потенциальное указание типа из заметки
    return text.replace(/\b(MERCH|FOOD|CHARACTER|GENERAL)\b/gi, '').trim() || undefined;
  }

  private setupHandlers() {
    // Callback query handler for buttons
    this.bot.on('callback_query', async (ctx: Context) => {
      const typedCtx = ctx as BotContext;
      if (!typedCtx.callbackQuery) return;
      const data = (typedCtx.callbackQuery as { data?: string })?.data;
      if (!data) return;
      const userId = typedCtx.from.id.toString();

      try {
        await this.usersService.findOrCreateUser(
          userId,
          typedCtx.from.username,
          typedCtx.from.first_name,
          typedCtx.from.last_name,
        );
      } catch (e) {
        console.error('Error in callback', e);
        await typedCtx.reply('Ошибка регистрации. Попробуйте позже.');
        return;
      }

      if (data === 'main_menu') {
        await typedCtx.editMessageText(
          '<b>🔥 Главное меню AI Analyzer</b>\n\nВыберите действие:',
          {
            parse_mode: 'HTML',
            ...this.getMainMenu(),
          },
        );
      } else if (data === 'analyze') {
        await typedCtx.editMessageText(
          '<b>🔍 Выберите тип анализа</b>\n\n' +
            'Отправьте фото после выбора типа. Можно добавить заметку в подпись.',
          {
            parse_mode: 'HTML',
            ...this.getAnalysisTypesMenu(),
          },
        );
      } else if (data.startsWith('type_')) {
        const typeStr = data.replace('type_', '');
        const type = typeStr as AnalysisType;
        typedCtx.session.selectedType = type;
        await typedCtx.editMessageText(
          `<b>✅ Тип выбран: ${type}</b>\n\n` +
            '📤 Теперь отправьте фото для анализа.\n' +
            '<i>Добавьте заметку в подпись фото для более точного результата.</i>',
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Назад', 'analyze')]]),
          },
        );
      } else if (data === 'balance') {
        const balance = await this.usersService.getUserBalance(userId);
        const status = balance.isPro
          ? 'Pro ✅'
          : 'Free (попытки: ' + balance.freeAttempts + ')';
        await typedCtx.editMessageText(
          `<b>💳 Ваш баланс</b>\n\n` +
            `Статус: <b>${status}</b>\n` +
            `Подписка: ${balance.subscriptionStatus || 'Не активна'}`,
          {
            parse_mode: 'HTML',
            ...this.getBalanceMenu(balance.isPro),
          },
        );
      } else if (data === 'balance_pro') {
        await typedCtx.answerCbQuery(
          'Ваша Pro подписка активна! Неограниченные анализы.',
        );
      } else if (data === 'subscribe') {
        await typedCtx.editMessageText(
          '<b>⭐ Подписка Pro</b>\n\n' +
            'Получите неограниченный доступ к анализу за 299 руб/мес.\n\n' +
            'Преимущества:\n' +
            '• Неограниченные анализы\n' +
            '• Приоритетная обработка\n' +
            '• Расширенная статистика',
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.url('💳 Оплатить', 'https://example.com/subscribe')], // Replace with actual payment link
              [Markup.button.callback('🔙 Главное меню', 'main_menu')],
            ]),
          },
        );
      } else if (data === 'history') {
        const analyses = await this.analysisService.getUserAnalyses(
          Number(typedCtx.from.id),
          5,
          0,
        );
        if (analyses.length === 0) {
          await typedCtx.editMessageText(
            '<b>📊 Ваша история пуста</b>\n\n' +
              'Сделайте первый анализ, чтобы увидеть результаты здесь.',
            {
              parse_mode: 'HTML',
              ...Markup.inlineKeyboard([
                [Markup.button.callback('🔙 Главное меню', 'main_menu')],
              ]),
            },
          );
        } else {
          let message = '<b>📊 Последние анализы</b>\n\n';
          analyses.slice(0, 5).forEach((analysis, index) => {
            message += `${index + 1}. ${analysis.type} (${analysis.createdAt.toLocaleDateString()})\n`;
          });
          message += '\nВыберите анализ для деталей:';
          const keyboard = analyses
            .slice(0, 5)
            .map((analysis) => [
              Markup.button.callback(
                `${analysis.type} #${analysis.id}`,
                `view_${analysis.id}`,
              ),
            ]);
          keyboard.push([Markup.button.callback('🔙 Главное меню', 'main_menu')]);
          await typedCtx.editMessageText(message, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard(keyboard),
          });
        }
      } else if (data.startsWith('view_')) {
        const analysisId = parseInt(data.replace('view_', ''));
        const analysis = await this.analysisService.getAnalysisById(analysisId);
        if (analysis) {
          await typedCtx.editMessageText(
            `<b>📋 Анализ #${analysisId}</b>\n\n` +
              `Тип: <b>${analysis.type}</b>\n` +
              `Дата: ${analysis.createdAt.toLocaleString()}\n` +
              `Заметка: ${analysis.note || 'Нет'}\n\n` +
              `<i>${analysis.resultText}</i>\n\n` +
              `Оценка: ${analysis.score || 'N/A'} / 10`,
            {
              parse_mode: 'HTML',
              ...Markup.inlineKeyboard([
                [
                  Markup.button.callback('🔙 История', 'history'),
                  Markup.button.callback('🔙 Главное меню', 'main_menu'),
                ],
              ]),
            },
          );
        } else {
          await typedCtx.answerCbQuery('Анализ не найден.');
        }
      } else if (data === 'help') {
        await typedCtx.editMessageText(
          '<b>❓ Помощь</b>\n\n' +
            '• <b>Анализ</b>: Выберите тип и отправьте фото\n' +
            '• <b>Баланс</b>: Проверьте статус и попытки\n' +
            '• <b>История</b>: Просмотрите прошлые анализы\n' +
            '• <b>Подписка</b>: Оформите Pro для неограниченного доступа\n\n' +
            'Поддержка: @support_bot',
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('🔙 Главное меню', 'main_menu')],
            ]),
          },
        );
      }

      await typedCtx.answerCbQuery();
    });

    // /start — регистрация и главное меню
    this.bot.start(async (ctx: Context) => {
      const typedCtx = ctx as BotContext;
      try {
        const u = typedCtx.from;
        await this.usersService.findOrCreateUser(
          u.id.toString(),
          u.username,
          u.first_name,
          u.last_name,
        );
        await typedCtx.replyWithHTML(
          '<b>🎉 Добро пожаловать в AI Analyzer!</b>\n\n' +
            'Искусственный интеллект для анализа изображений.\n' +
            'Выберите действие ниже:',
          { ...this.getMainMenu() },
        );
      } catch (e) {
        console.error('Ошибка /start:', e);
        await typedCtx.reply('Ошибка инициализации. Попробуйте позже.');
      }
    });

    // /help — показать главное меню
    this.bot.command('help', async (ctx: Context) => {
      const typedCtx = ctx as BotContext;
      await typedCtx.replyWithHTML(
        '<b>❓ Помощь</b>\n\n' +
          '• <b>Анализ</b>: Выберите тип и отправьте фото\n' +
          '• <b>Баланс</b>: Проверьте статус и попытки\n' +
          '• <b>История</b>: Просмотрите прошлые анализы\n' +
          '• <b>Подписка</b>: Оформите Pro для неограниченного доступа\n\n' +
          'Поддержка: @support_bot',
        {
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Главное меню', 'main_menu')],
          ]),
        },
      );
    });

    // /balance — баланс и статус
    this.bot.command('balance', async (ctx: Context) => {
      const typedCtx = ctx as BotContext;
      try {
        const userId = typedCtx.from.id.toString();
        const bal = await this.usersService.getUserBalance(userId);
        const status = bal.isPro ? 'Pro ✅' : 'Free (попытки: ' + bal.freeAttempts + ')';
        await typedCtx.replyWithHTML(
          `<b>💳 Ваш баланс</b>\n\n` +
            `Статус: <b>${status}</b>\n` +
            `Подписка: ${bal.subscriptionStatus || 'Не активна'}`,
          { ...this.getBalanceMenu(bal.isPro) },
        );
      } catch (e) {
        console.error('Ошибка /balance:', e);
        await typedCtx.reply('Не удалось получить баланс.');
      }
    });

    // /analyze — подсказка
    this.bot.command('analyze', async (ctx: Context) => {
      const typedCtx = ctx as BotContext;
      await typedCtx.replyWithHTML(
        '<b>🔍 Выберите тип анализа</b>\n\n' +
          'Отправьте фото после выбора типа. Можно добавить заметку в подпись.',
        { ...this.getAnalysisTypesMenu() },
      );
    });

    // Обработка фото: анализ
    this.bot.on('message', async (ctx: Context) => {
      const typedCtx = ctx as BotContext;
      if (!typedCtx.message || !('photo' in typedCtx.message)) return;
      const user = typedCtx.from;
      const photo = typedCtx.message.photo;
      const fileId = photo[photo.length - 1].file_id; // Самое большое фото
      const caption = typedCtx.message.caption;

      let type: AnalysisType = AnalysisType.GENERAL;
      const note = this.extractNote(caption);

      // If type selected via button
      if (typedCtx.session.selectedType) {
        type = typedCtx.session.selectedType;
        delete typedCtx.session.selectedType; // Clear after use
      } else {
        type = this.parseAnalysisType(caption);
      }

      try {
        // Находим или создаем пользователя
        const dbUser = await this.usersService.findOrCreateUser(
          user.id.toString(),
          user.username,
          user.first_name,
          user.last_name,
        );

        // Получаем временную ссылку на файл из Telegram
        const fileLink = await this.bot.telegram.getFileLink(fileId);
        const imageUrl = typeof fileLink === 'string' ? fileLink : fileLink.toString();

        // Создаем запись анализа и запускаем обработку
        await this.analysisService.createAnalysis(
          dbUser.id,
          type,
          fileId,
          imageUrl,
          note,
        );

        await typedCtx.replyWithHTML(
          '<b>📸 Фото принято!</b>\n\n' +
            `<i>Тип анализа: ${type}</i>\n` +
            '⏳ Результат будет готов через несколько секунд. Оставайтесь на связи!',
          {
            ...Markup.inlineKeyboard([
              [Markup.button.callback('🔙 Главное меню', 'main_menu')],
            ]),
          },
        );
      } catch (error) {
        console.error('Ошибка обработки фото:', error);
        await typedCtx.reply('❌ Произошла ошибка при обработке фото. Попробуйте позже.');
      }
    });
  }
}
