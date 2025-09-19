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

      const startTime = Date.now();
      console.log(
        `[CALLBACK_START] Query ID: ${typedCtx.callbackQuery.id}, Data: ${data}, Time: ${startTime}`,
      );

      const userTime = Date.now();
      try {
        await this.usersService.findOrCreateUser(
          userId,
          typedCtx.from.username,
          typedCtx.from.first_name,
          typedCtx.from.last_name,
        );
        console.log(
          `[CALLBACK_USER] After findOrCreateUser, elapsed: ${Date.now() - userTime}ms, total: ${Date.now() - startTime}ms`,
        );
      } catch (e) {
        console.error('Error in callback', e);
        await typedCtx.reply('Ошибка регистрации. Попробуйте позже.');
        return;
      }

      if (data === 'main_menu') {
        const menuTime = Date.now();
        await typedCtx.editMessageText(
          '<b>🔥 Главное меню AI Analyzer</b>\n\nВыберите действие:',
          {
            parse_mode: 'HTML',
            ...this.getMainMenu(),
          },
        );
        console.log(
          `[CALLBACK_MENU] After editMessageText for main_menu, elapsed: ${Date.now() - menuTime}ms, total: ${Date.now() - startTime}ms`,
        );
      } else if (data === 'analyze') {
        const analyzeTime = Date.now();
        await typedCtx.editMessageText(
          '<b>🔍 Выберите тип анализа</b>\n\n' +
            'Отправьте фото после выбора типа. Можно добавить заметку в подпись.',
          {
            parse_mode: 'HTML',
            ...this.getAnalysisTypesMenu(),
          },
        );
        console.log(
          `[CALLBACK_ANALYZE] After editMessageText for analyze, elapsed: ${Date.now() - analyzeTime}ms, total: ${Date.now() - startTime}ms`,
        );
      } else if (data.startsWith('type_')) {
        const typeTime = Date.now();
        const typeStr = data.replace('type_', '');
        const upperType = typeStr.toUpperCase() as keyof typeof AnalysisType;
        const type = AnalysisType[upperType] || AnalysisType.GENERAL;
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
        console.log(
          `[CALLBACK_TYPE] After editMessageText for type, elapsed: ${Date.now() - typeTime}ms, total: ${Date.now() - startTime}ms`,
        );
      } else if (data === 'balance') {
        const balanceTime = Date.now();
        const balance = await this.usersService.getUserBalance(userId);
        console.log(
          `[CALLBACK_BALANCE] After getUserBalance, elapsed: ${Date.now() - balanceTime}ms, total: ${Date.now() - startTime}ms`,
        );
        const status = balance.isPro
          ? 'Pro ✅'
          : 'Free (попытки: ' + balance.freeAttempts + ')';
        const editBalanceTime = Date.now();
        await typedCtx.editMessageText(
          `<b>💳 Ваш баланс</b>\n\n` +
            `Статус: <b>${status}</b>\n` +
            `Подписка: ${balance.subscriptionStatus || 'Не активна'}`,
          {
            parse_mode: 'HTML',
            ...this.getBalanceMenu(balance.isPro),
          },
        );
        console.log(
          `[CALLBACK_BALANCE_EDIT] After editMessageText for balance, elapsed: ${Date.now() - editBalanceTime}ms, total: ${Date.now() - startTime}ms`,
        );
      } else if (data === 'balance_pro') {
        const proTime = Date.now();
        await typedCtx.answerCbQuery(
          'Ваша Pro подписка активна! Неограниченные анализы.',
        );
        console.log(
          `[CALLBACK_PRO] After answerCbQuery for balance_pro, elapsed: ${Date.now() - proTime}ms, total: ${Date.now() - startTime}ms`,
        );
      } else if (data === 'subscribe') {
        const subscribeTime = Date.now();
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
        console.log(
          `[CALLBACK_SUBSCRIBE] After editMessageText for subscribe, elapsed: ${Date.now() - subscribeTime}ms, total: ${Date.now() - startTime}ms`,
        );
      } else if (data === 'history') {
        const historyTime = Date.now();
        try {
          const userFindTime = Date.now();
          const user = await this.usersService.findByTelegramId(userId);
          console.log(
            `[CALLBACK_HISTORY_USER] After findByTelegramId, elapsed: ${Date.now() - userFindTime}ms, total: ${Date.now() - startTime}ms`,
          );
          if (!user) {
            await typedCtx.editMessageText(
              '<b>❌ Пользователь не найден</b>\n\nИспользуйте /start для регистрации.',
              {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                  [Markup.button.callback('🔙 Главное меню', 'main_menu')],
                ]),
              },
            );
            return;
          }
          const analysesTime = Date.now();
          const analyses = await this.analysisService.getUserAnalyses(user.id, 5, 0);
          console.log(
            `[CALLBACK_HISTORY_ANALYSES] After getUserAnalyses, elapsed: ${Date.now() - analysesTime}ms, total: ${Date.now() - startTime}ms`,
          );
          if (analyses.length === 0) {
            const emptyTime = Date.now();
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
            console.log(
              `[CALLBACK_HISTORY_EMPTY] After edit for empty history, elapsed: ${Date.now() - emptyTime}ms, total: ${Date.now() - startTime}ms`,
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
            const editHistTime = Date.now();
            await typedCtx.editMessageText(message, {
              parse_mode: 'HTML',
              ...Markup.inlineKeyboard(keyboard),
            });
            console.log(
              `[CALLBACK_HISTORY_EDIT] After editMessageText for history, elapsed: ${Date.now() - editHistTime}ms, total: ${Date.now() - startTime}ms`,
            );
          }
        } catch (error) {
          console.error('Error fetching user history:', error);
          const errorTime = Date.now();
          await typedCtx.editMessageText(
            '<b>❌ Ошибка загрузки истории</b>\n\nПопробуйте позже.',
            {
              parse_mode: 'HTML',
              ...Markup.inlineKeyboard([
                [Markup.button.callback('🔙 Главное меню', 'main_menu')],
              ]),
            },
          );
          console.log(
            `[CALLBACK_HISTORY_ERROR] After error edit, elapsed: ${Date.now() - errorTime}ms, total: ${Date.now() - startTime}ms`,
          );
        }
      } else if (data.startsWith('view_')) {
        const viewTime = Date.now();
        const analysisId = parseInt(data.replace('view_', ''));
        const analysisFetchTime = Date.now();
        const analysis = await this.analysisService.getAnalysisById(analysisId);
        console.log(
          `[CALLBACK_VIEW_FETCH] After getAnalysisById, elapsed: ${Date.now() - analysisFetchTime}ms, total: ${Date.now() - startTime}ms`,
        );
        if (analysis) {
          const viewEditTime = Date.now();
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
          console.log(
            `[CALLBACK_VIEW_EDIT] After editMessageText for view, elapsed: ${Date.now() - viewEditTime}ms, total: ${Date.now() - startTime}ms`,
          );
        } else {
          await typedCtx.answerCbQuery('Анализ не найден.');
        }
      } else if (data === 'help') {
        const helpTime = Date.now();
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
        console.log(
          `[CALLBACK_HELP] After editMessageText for help, elapsed: ${Date.now() - helpTime}ms, total: ${Date.now() - startTime}ms`,
        );
      }

      const answerTime = Date.now();
      await typedCtx.answerCbQuery();
      const totalElapsed = Date.now() - startTime;
      console.log(`[CALLBACK_END] After answerCbQuery, total elapsed: ${totalElapsed}ms`);
      if (totalElapsed > 10000) {
        console.warn(
          `[CALLBACK_WARNING] Handler took too long: ${totalElapsed}ms for data: ${data}`,
        );
      }
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
