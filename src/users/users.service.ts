import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { User, Subscription, Analysis } from '@prisma/client';

export interface UserWithSubscriptionAndAnalyses extends User {
  subscription: Subscription | null;
  analyses?: Analysis[];
}

@Injectable()
export class UsersService {
  private readonly defaultFreeAttempts: number;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    this.defaultFreeAttempts = parseInt(
      this.configService.get<string>('FREE_ATTEMPTS', '5'),
    );
  }

  /**
   * Найти или создать пользователя по Telegram ID
   */
  async findOrCreateUser(
    telegramId: string,
    username?: string,
    firstName?: string,
    lastName?: string,
  ): Promise<UserWithSubscriptionAndAnalyses> {
    let user = await this.prisma.user.findUnique({
      where: { telegramId },
      include: {
        subscription: true,
      },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          telegramId,
          username,
          firstName,
          lastName,
          freeAttempts: this.defaultFreeAttempts,
        },
        include: {
          subscription: true,
        },
      });
      console.log(`Создан новый пользователь: ${telegramId}`);
    }

    return user;
  }

  /**
   * Получить пользователя по ID
   */
  async findById(id: number): Promise<UserWithSubscriptionAndAnalyses> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        subscription: true,
        analyses: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`Пользоват��ль с ID ${id} не найден`);
    }

    return user;
  }

  /**
   * Получить пользователя по Telegram ID
   */
  async findByTelegramId(
    telegramId: string,
  ): Promise<UserWithSubscriptionAndAnalyses | null> {
    return this.prisma.user.findUnique({
      where: { telegramId },
      include: {
        subscription: true,
      },
    });
  }

  /**
   * Проверить, может ли пользователь сделать анализ
   */
  async canMakeAnalysis(userId: number): Promise<boolean> {
    const user = await this.findById(userId);

    // Если есть активная подписка Pro
    if (user.isPro && user.subscription?.status === 'ACTIVE') {
      return true;
    }

    // Если есть бесплатные попытки
    return user.freeAttempts > 0;
  }

  /**
   * Использовать бесплатную попытку
   */
  async useFreeAttempt(userId: number): Promise<void> {
    const user = await this.findById(userId);

    if (user.isPro && user.subscription?.status === 'ACTIVE') {
      // Pro пользователи не тратят попытки
      return;
    }

    if (user.freeAttempts <= 0) {
      throw new Error('У пользователя нет бесплатных попыток');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        freeAttempts: user.freeAttempts - 1,
      },
    });
  }

  /**
   * Активировать Pro подписку
   */
  async activateProSubscription(userId: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Обновляем статус пользователя
      await tx.user.update({
        where: { id: userId },
        data: { isPro: true },
      });

      // Создаем или обновляем подписку
      await tx.subscription.upsert({
        where: { userId },
        create: {
          userId,
          status: 'ACTIVE',
          startedAt: new Date(),
        },
        update: {
          status: 'ACTIVE',
          startedAt: new Date(),
        },
      });
    });

    console.log(`Активирована Pro подписка для пользователя ${userId}`);
  }

  /**
   * Получить баланс пользователя (попытки и статус подписки)
   */
  async getUserBalance(telegramId: string): Promise<{
    freeAttempts: number;
    isPro: boolean;
    subscriptionStatus?: string;
  }> {
    const user = await this.findByTelegramId(telegramId);

    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    return {
      freeAttempts: user.freeAttempts,
      isPro: user.isPro,
      subscriptionStatus: user.subscription?.status,
    };
  }
}
