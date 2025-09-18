import { Controller, Get, Param } from '@nestjs/common';
import { UsersService, UserWithSubscriptionAndAnalyses } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':id')
  async getById(@Param('id') id: string): Promise<UserWithSubscriptionAndAnalyses> {
    return this.usersService.findById(Number(id));
  }

  @Get('tg/:telegramId/balance')
  async getBalance(@Param('telegramId') telegramId: string) {
    return this.usersService.getUserBalance(telegramId);
  }
}
