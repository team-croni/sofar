import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ListeningService } from './listening.service';
import { LtrTrainerService } from './ltr-trainer.service';
import { AdminGuard } from '../admin/admin.guard';
import type {
  PlayEventInput,
  RecommendationEventInput,
} from './listening.service';

/**
 * 감상 기록 수집과 홈 추천.
 * 로그인하지 않아도 동작한다. Authorization 헤더가 있으면 검증된 사용자로 기록한다.
 */
@Controller()
export class ListeningController {
  constructor(
    private readonly listeningService: ListeningService,
    private readonly trainer: LtrTrainerService,
  ) {}

  /** 관리자: 학습 가중치 상태 (켜진 버전, 마지막 학습 결과) */
  @Get('recommend/model')
  @UseGuards(AdminGuard)
  async modelStatus() {
    return { success: true, ...(await this.trainer.status()) };
  }

  /** 관리자: 지금 바로 학습 (데이터가 부족하거나 기존보다 낫지 않으면 바꾸지 않음) */
  /** 관리자: '함께 들은 곡' 이웃을 지금 다시 계산 (평소에는 DB가 매일 새벽 계산) */
  @Post('recommend/neighbors/rebuild')
  @UseGuards(AdminGuard)
  async rebuildNeighbors() {
    return {
      success: true,
      ...(await this.listeningService.rebuildCfNeighbors()),
    };
  }

  @Post('recommend/model/train')
  @UseGuards(AdminGuard)
  async train() {
    return { success: true, result: await this.trainer.train() };
  }

  @Post('events/play')
  @HttpCode(202)
  async recordPlay(
    @Body() body: PlayEventInput,
    @Headers('authorization') authorization?: string,
  ): Promise<{ success: boolean }> {
    const userId = await this.listeningService.resolveUserId(authorization);
    const success = await this.listeningService.recordPlayEvent(
      body || {},
      userId,
    );
    return { success };
  }

  @Post('events/recommendation')
  @HttpCode(202)
  async recordRecommendation(
    @Body() body: RecommendationEventInput,
    @Headers('authorization') authorization?: string,
  ): Promise<{ success: boolean }> {
    const userId = await this.listeningService.resolveUserId(authorization);
    const success = await this.listeningService.recordRecommendationEvents(
      body || {},
      userId,
    );
    return { success };
  }

  @Get('recommend/home')
  async getHome(
    @Query('clientId') clientId?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const userId = await this.listeningService.resolveUserId(authorization);
    const result = await this.listeningService.getHomeRecommendations(
      userId,
      typeof clientId === 'string' ? clientId.slice(0, 100) : null,
    );
    return { success: true, personalized: !result.coldStart, ...result };
  }
}
