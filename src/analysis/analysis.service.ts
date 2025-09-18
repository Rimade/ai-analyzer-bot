import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AnalysisType } from '@prisma/client';

@Injectable()
export class AnalysisService {
  constructor(private prisma: PrismaService) {}

  async createAnalysis(userId: number, type: AnalysisType, fileId: string) {
    return this.prisma.analysis.create({
      data: {
        userId,
        type,
        inputFileId: fileId,
        resultText: 'Analysis pending...',
      },
    });
  }
}
