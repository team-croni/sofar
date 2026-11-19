import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
} from '@nestjs/common';
import { ListeningService } from './listening.service';
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
  constructor(private readonly listeningService: ListeningService) {}

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
