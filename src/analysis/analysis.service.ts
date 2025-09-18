import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { OpenAIService } from './openai.service';
import { AnalysisType, Analysis } from '@prisma/client';

@Injectable()
export class AnalysisService {
  constructor(
    private prisma: PrismaService,
    private usersService: UsersService,
    private openaiService: OpenAIService,
    private configService: ConfigService,
  ) {}

  /**
   * Создать новый анализ изображения
   */
  async createAnalysis(
    userId: number,
    type: AnalysisType,
    fileId: string,
    imageUrl?: string,
    userNote?: string,
  ): Promise<Analysis> {
    // Проверяем, может ли пользователь сделать анализ
    const canAnalyze = await this.usersService.canMakeAnalysis(userId);
    if (!canAnalyze) {
      throw new BadRequestException(
        'У вас закончились бесплатные попытки. Оформите Pro подписку для неограниченного доступа.',
      );
    }

    // Создаем запись анализа со статусом "в процессе"
    const analysis = await this.prisma.analysis.create({
      data: {
        userId,
        type,
        inputFileId: fileId,
        inputUrl: imageUrl,
        note: userNote,
        resultText: 'Анализ в процессе...',
      },
    });

    // Запускаем анализ асинхронно
    this.processAnalysis(analysis.id, imageUrl || fileId, type, userNote, userId).catch(
      (error) => {
        console.error(`Ошибка при обработке анализа ${analysis.id}:`, error);
        // Обновляем запись с ошибкой
        this.prisma.analysis
          .update({
            where: { id: analysis.id },
            data: {
              resultText: 'Произошла ошибка при анализе изображения. Попробуйте позже.',
            },
          })
          .catch(console.error);
      },
    );

    return analysis;
  }

  /**
   * Обработать анализ изображения
   */
  private async processAnalysis(
    analysisId: number,
    imageSource: string,
    type: AnalysisType,
    userNote?: string,
    userId?: number,
  ): Promise<void> {
    try {
      // Получаем результат анализа от OpenAI
      const result = await this.openaiService.analyzeImage(imageSource, type, userNote);

      // Обновляем запись анализа
      await this.prisma.analysis.update({
        where: { id: analysisId },
        data: {
          resultText: result.text,
          score: result.score,
        },
      });

      // Списываем попытку у пользователя (если не Pro)
      if (userId) {
        await this.usersService.useFreeAttempt(userId);
      }

      console.log(`Анализ ${analysisId} успешно завершен`);
    } catch (error) {
      console.error(`Ошибка при обработке анализа ${analysisId}:`, error);
      throw error;
    }
  }

  /**
   * Получить анализ по ID
   */
  async getAnalysisById(id: number): Promise<Analysis | null> {
    return this.prisma.analysis.findUnique({
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
   * Получить историю анализов пользователя
   */
  async getUserAnalyses(userId: number, limit = 10, offset = 0): Promise<Analysis[]> {
    return this.prisma.analysis.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Получить статистику анализов пользователя
   */
  async getUserAnalysisStats(userId: number): Promise<{
    total: number;
    byType: Record<AnalysisType, number>;
    averageScore: number | null;
  }> {
    const analyses = await this.prisma.analysis.findMany({
      where: { userId },
      select: {
        type: true,
        score: true,
      },
    });

    const total = analyses.length;
    const byType = analyses.reduce(
      (acc, analysis) => {
        acc[analysis.type] = (acc[analysis.type] || 0) + 1;
        return acc;
      },
      {} as Record<AnalysisType, number>,
    );

    const scoresWithValues = analyses
      .map((a) => a.score)
      .filter((score): score is number => score !== null);

    const averageScore =
      scoresWithValues.length > 0
        ? scoresWithValues.reduce((sum, score) => sum + score, 0) /
          scoresWithValues.length
        : null;

    return {
      total,
      byType,
      averageScore,
    };
  }

  /**
   * Получить последние анализы для админки
   */
  async getRecentAnalyses(limit = 20): Promise<Analysis[]> {
    return this.prisma.analysis.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
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
}
