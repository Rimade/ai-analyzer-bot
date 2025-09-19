import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { PaymentStatus, Payment } from '@prisma/client';
import { YooKassa } from '@appigram/yookassa-node';
import * as crypto from 'crypto';

export interface CreatePaymentDto {
  userId: number;
  amount: number;
  currency?: string;
  provider: 'stripe' | 'yookassa';
}

export interface PaymentResult {
  paymentId: number;
  paymentUrl?: string;
  status: PaymentStatus;
}

@Injectable()
export class PaymentsService {
  private readonly stripeKey: string;
  private readonly yookassaShopId: string;
  private readonly yookassaSecretKey: string;
  private yookassaClient: YooKassa;

  constructor(
    private prisma: PrismaService,
    private usersService: UsersService,
    private configService: ConfigService,
  ) {
    this.stripeKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    this.yookassaShopId = this.configService.get<string>('YOOKASSA_SHOP_ID');
    this.yookassaSecretKey = this.configService.get<string>('YOOKASSA_SECRET_KEY');
    this.yookassaClient = new YooKassa(this.yookassaShopId, this.yookassaSecretKey);
  }

  /**
   * Создать новый платеж
   */
  async createPayment(dto: CreatePaymentDto): Promise<PaymentResult> {
    // Создаем запись платежа в БД
    const payment = await this.prisma.payment.create({
      data: {
        userId: dto.userId,
        amount: dto.amount,
        currency: dto.currency || 'RUB',
        provider: dto.provider,
        status: PaymentStatus.PENDING,
      },
    });

    try {
      let paymentUrl: string | undefined;

      // Создаем платеж в выбранной платежной системе
      if (dto.provider === 'stripe' && this.stripeKey) {
        paymentUrl = await this.createStripePayment(payment);
      } else if (dto.provider === 'yookassa' && this.yookassaSecretKey) {
        paymentUrl = await this.createYookassaPayment(payment);
      } else {
        // Mock режим для разработки
        paymentUrl = `https://mock-payment.com/pay/${payment.id}`;
        console.log(`Mock платеж создан: ${paymentUrl}`);
      }

      return {
        paymentId: payment.id,
        paymentUrl,
        status: payment.status,
      };
    } catch (error) {
      console.error('Ошибка при создании платежа:', error);

      // Обновляем статус платежа на FAILED
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED },
      });

      throw new BadRequestException('Не удалось создать платеж');
    }
  }

  /**
   * Создать платеж через Stripe
   */
  private async createStripePayment(payment: Payment): Promise<string> {
    // TODO: Реализовать интеграцию со Stripe
    // Пока возвращаем mock URL
    return `https://checkout.stripe.com/pay/mock_${payment.id}`;
  }

  /**
   * Создать платеж через YooKassa
   */
  private async createYookassaPayment(payment: Payment): Promise<string> {
    if (!this.yookassaShopId || !this.yookassaSecretKey) {
      throw new BadRequestException('YooKassa credentials not configured');
    }

    const idempotencyKey = payment.id.toString();
    const paymentData = {
      amount: {
        value: payment.amount.toFixed(2),
        currency: payment.currency,
      },
      confirmation: {
        type: 'redirect',
        return_url:
          this.configService.get<string>('FRONTEND_URL') ||
          'https://t.me/your_bot_username',
      },
      capture: true,
      description: `Pro subscription for user ${payment.userId}`,
      metadata: {
        userId: payment.userId.toString(),
      },
    };

    try {
      const yookassaPayment = await this.yookassaClient.createPayment(
        idempotencyKey,
        paymentData,
      );

      // Update DB with external ID
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { externalId: yookassaPayment.id },
      });

      return yookassaPayment.confirmation.confirmation_url;
    } catch (error) {
      console.error('YooKassa payment creation error:', error);
      throw new BadRequestException('Failed to create YooKassa payment');
    }
  }

  /**
   * Обработать webhook о статусе платежа
   */
  async handlePaymentWebhook(
    paymentId: number,
    status: PaymentStatus,
    externalId?: string,
  ): Promise<void> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { user: true },
    });

    if (!payment) {
      throw new BadRequestException('Платеж не найден');
    }

    // Обновляем статус платежа
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status,
      },
    });

    // Если платеж успешен, активируем Pro подписку
    if (status === PaymentStatus.SUCCESS) {
      await this.usersService.activateProSubscription(payment.userId);
      console.log(
        `Pro подписка активирована для пользователя ${payment.userId} после платежа ${paymentId}`,
      );
    }
  }

  /**
   * Обработать уведомление от YooKassa
   */
  async handleYookassaNotification(body: any): Promise<void> {
    if (body.event !== 'payment.succeeded' && body.event !== 'payment.canceled') {
      console.log('Ignored Yookassa event:', body.event);
      return;
    }

    const externalId = body.object.id;
    const status =
      body.event === 'payment.succeeded' ? PaymentStatus.SUCCESS : PaymentStatus.FAILED;

    const payment = await this.prisma.payment.findUnique({
      where: { externalId },
      include: { user: true },
    });

    if (!payment) {
      console.error('Payment not found for externalId:', externalId);
      return;
    }

    // Update status
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status },
    });

    if (status === PaymentStatus.SUCCESS) {
      await this.usersService.activateProSubscription(payment.userId);
      console.log(`Pro activated for user ${payment.userId} via Yookassa ${externalId}`);
    }
  }

  /**
   * Получить платеж по ID
   */
  async getPaymentById(id: number): Promise<Payment | null> {
    return this.prisma.payment.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            telegramId: true,
            username: true,
            firstName: true,
          },
        },
      },
    });
  }

  /**
   * Получить историю платежей пользователя
   */
  async getUserPayments(userId: number): Promise<Payment[]> {
    return this.prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Создать Pro подписку (стандартная цена)
   */
  async createProSubscriptionPayment(
    userId: number,
    provider: 'stripe' | 'yookassa' = 'yookassa',
  ): Promise<PaymentResult> {
    const proPrice = parseFloat(
      this.configService.get<string>('PRO_SUBSCRIPTION_PRICE', '299'),
    );

    return this.createPayment({
      userId,
      amount: proPrice,
      currency: 'RUB',
      provider,
    });
  }
}
