import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AnalysisService } from './analysis.service';
import { AnalysisType } from '@prisma/client';

@Controller('analysis')
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.analysisService.getAnalysisById(Number(id));
    }

  @Get('user/:userId')
  async getUserAnalyses(
    @Param('userId') userId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.analysisService.getUserAnalyses(
      Number(userId),
      limit ? Number(limit) : 10,
      offset ? Number(offset) : 0,
    );
  }

  @Get('user/:userId/stats')
  async getUserStats(@Param('userId') userId: string) {
    return this.analysisService.getUserAnalysisStats(Number(userId));
  }

  @Post()
  async create(
    @Body()
    body: {
      userId: number;
      type: AnalysisType;
      fileId: string;
      imageUrl?: string;
      note?: string;
    },
  ) {
    return this.analysisService.createAnalysis(
      body.userId,
      body.type,
      body.fileId,
      body.imageUrl,
      body.note,
    );
  }
}
