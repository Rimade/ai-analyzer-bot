import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findOrCreateUser(
    telegramId: string,
    username?: string,
    firstName?: string,
    lastName?: string,
  ) {
    let user = await this.prisma.user.findUnique({
      where: { telegramId },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          telegramId,
          username,
          firstName,
          lastName,
          freeAttempts: 5,
        },
      });
    }

    return user;
  }
}
