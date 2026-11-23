import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Req,
} from '@nestjs/common';
import { RateLimiter } from '../listening/supabase-rest';
import { ChannelService } from './channel.service';

@Controller('channels')
export class ChannelController {
  // 핸들을 차례로 넣어 보는 수집을 막는다 (IP당 분당 120회)
  private readonly limiter = new RateLimiter(120, 60_000);

  constructor(private readonly channelService: ChannelService) {}

  /** 공개 채널: GET /api/channels/:handle (로그인 없이 볼 수 있음) */
  @Get(':handle')
  async getChannel(
    @Param('handle') handle: string,
    @Req() req: { ip?: string; headers: Record<string, string | undefined> },
  ) {
    const ip =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.ip ||
      'unknown';
    if (!this.limiter.allow(ip)) {
      throw new HttpException(
        '잠시 후 다시 시도해 주세요.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return { success: true, ...(await this.channelService.getChannel(handle)) };
  }
}
