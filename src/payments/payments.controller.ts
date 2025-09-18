import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentStatus } from '@prisma/client';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  async create(
    @Body()
    body: {
      userId: number;
      provider: 'stripe' | 'yookassa';
      amount?: number; // если не задана — используем стандартную цену
    },
  ) {
    if (!body.amount) {
      return this.paymentsService.createProSubscriptionPayment(
        body.userId,
        body.provider,
      );
    }
    return this.paymentsService.createPayment({
      userId: body.userId,
      amount: body.amount,
      provider: body.provider,
    });
  }

  // Webhook обработчик для обновления статуса платежа
  @Post(':id/webhook')
  async webhook(
    @Param('id') id: string,
    @Body() body: { status: PaymentStatus; externalId?: string },
  ) {
    await this.paymentsService.handlePaymentWebhook(
      Number(id),
      body.status,
      body.externalId,
    );
    return { ok: true };
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.paymentsService.getPaymentById(Number(id));
  }

  @Get('user/:userId')
  async getUserPayments(@Param('userId') userId: string) {
    return this.paymentsService.getUserPayments(Number(userId));
  }
}
