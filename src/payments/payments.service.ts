import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { PaymentStatus, Payment } from '@prisma/client';

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
  private readonly yookassaKey: string;

  constructor(
    private prisma: PrismaService,
    private usersService: UsersService,
    private configService: ConfigService,
  ) {
    this.stripeKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    this.yookassaKey = this.configService.get<string>('YOOKASSA_SECRET_KEY');
  }

  /**
   * Создать новы�� платеж
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
      } else if (dto.provider === 'yookassa' && this.yookassaKey) {
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
    // TODO: Реализовать интеграцию с YooKassa
    // Пока возвращаем mock URL
    return `https://yoomoney.ru/checkout/mock_${payment.id}`;
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
      console.log(`Pro подписка активирована для пользователя ${payment.userId} после платежа ${paymentId}`);
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
