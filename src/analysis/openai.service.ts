import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnalysisType } from '@prisma/client';

export interface AnalysisResult {
  text: string;
  score?: number;
}

@Injectable()
export class OpenAIService {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.openai.com/v1';

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!this.apiKey) {
      console.warn('OPENAI_API_KEY не найден, будет использоваться mock режим');
    }
  }

  /**
   * Анализ изображения с помощью GPT-4 Vision
   */
  async analyzeImage(
    imageUrl: string,
    analysisType: AnalysisType,
    userNote?: string,
  ): Promise<AnalysisResult> {
    if (!this.apiKey) {
      return this.getMockAnalysis(analysisType);
    }

    try {
      const prompt = this.buildPrompt(analysisType, userNote);

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4-vision-preview',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: prompt,
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: imageUrl,
                  },
                },
              ],
            },
          ],
          max_tokens: 1000,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;

      if (!content) {
        throw new Error('Пустой ответ от OpenAI API');
      }

      return this.parseAnalysisResult(content, analysisType);
    } catch (error) {
      console.error('Ошибка при обращении к OpenAI API:', error);
      // Возвращаем mock результат в случае ошибки
      return this.getMockAnalysis(analysisType);
    }
  }

  /**
   * Построить промпт для анализа в зависимости от типа
   */
  private buildPrompt(analysisType: AnalysisType, userNote?: string): string {
    const basePrompt = userNote
      ? `Дополнительная информация от пользователя: "${userNote}"\n\n`
      : '';

    switch (analysisType) {
      case AnalysisType.MERCH:
        return `${basePrompt}Проанализируй этот товар/продукт. Оцени его качество, дизайн, потенциал продаж по шкале от 0 до 10. Дай подробные рекомендации по улучшению. Формат ответа: ОЦЕНКА: [число] АНАЛИЗ: [подробный текст]`;

      case AnalysisType.FOOD:
        return `${basePrompt}Проанализируй это блюдо. Оцени презентацию, аппетитность, качество подачи по шкале от 0 до 10. Дай рекомендации по улучшению. Формат ответа: ОЦЕНКА: [число] АНАЛИЗ: [подробный текст]`;

      case AnalysisType.CHARACTER:
        return `${basePrompt}Проанализируй этого персонажа/человека. Оцени стиль, харизму, общее впечатление по шкале от 0 до 10. Дай рекомендации. Формат ответа: ОЦЕНКА: [число] АНАЛИЗ: [подробный текст]`;

      case AnalysisType.GENERAL:
      default:
        return `${basePrompt}Проанализируй это изображение. Дай подробное описание и оценку по шкале от 0 до 10. Формат ответа: ОЦЕНКА: [число] АНАЛИЗ: [подробный текст]`;
    }
  }

  /**
   * Парсинг результата анализа
   */
  private parseAnalysisResult(
    content: string,
    analysisType: AnalysisType,
  ): AnalysisResult {
    // Ищем оценку в формате "ОЦЕНКА: X"
    const scoreMatch = content.match(/ОЦЕНКА:\s*(\d+)/i);
    const score = scoreMatch ? parseInt(scoreMatch[1]) : undefined;

    // Извлекаем текст анализа
    const analysisMatch = content.match(/АНАЛИЗ:\s*(.*)/is);
    const text = analysisMatch ? analysisMatch[1].trim() : content;

    return {
      text,
      score: score !== undefined && score >= 0 && score <= 10 ? score : undefined,
    };
  }

  /**
   * Mock анализ для тестирования и fallback
   */
  private getMockAnalysis(analysisType: AnalysisType): AnalysisResult {
    const mockResults = {
      [AnalysisType.MERCH]: {
        text: 'Mock анализ товара: Качественный продукт с хорошим потенциалом. Рекомендуется улучшить упаковку и добавить больше деталей в описание.',
        score: 7,
      },
      [AnalysisType.FOOD]: {
        text: 'Mock анализ блюда: Аппетитная подача, хорошие цвета. Можно улучшить композицию и добавить гарнир для большей привлекательности.',
        score: 8,
      },
      [AnalysisType.CHARACTER]: {
        text: 'Mock анализ персонажа: Интересный стиль, харизматичный образ. Рекомендуется поработать над позированием и освещением.',
        score: 6,
      },
      [AnalysisType.GENERAL]: {
        text: 'Mock общий анализ: Качественное изображение с хорошей композицией. Есть потенциал для улучшения в плане освещения и деталей.',
        score: 7,
      },
    };

    return mockResults[analysisType] || mockResults[AnalysisType.GENERAL];
  }
}
