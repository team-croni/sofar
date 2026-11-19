import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Ip,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ListeningService } from './listening.service';
import { SignalsService } from './signals.service';

/** 프록시(Render) 뒤에서는 첫 번째 X-Forwarded-For가 실제 접속 IP */
function clientIp(forwarded: string | undefined, fallback: string): string {
  return (forwarded || '').split(',')[0].trim() || fallback || 'unknown';
}

@Controller()
export class SignalsController {
  constructor(
    private readonly listening: ListeningService,
    private readonly signals: SignalsService,
  ) {}

  // 'playlists/likes'가 ':id' 경로보다 먼저 와야 한다
  @Get('playlists/likes')
  async likeCounts(
    @Query('ids') ids: string | undefined,
    @Ip() ip: string,
    @Headers('x-forwarded-for') forwarded?: string,
  ) {
    this.signals.guardRate(clientIp(forwarded, ip), null);
    return { success: true, counts: await this.signals.getLikeCounts(ids) };
  }

  @Get('playlists/:id/signals')
  async getSignals(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    const user = await this.listening.resolveUser(authorization);
    return { success: true, ...(await this.signals.getSignals(id, user)) };
  }

  @Post('playlists/:id/like')
  async like(
    @Param('id') id: string,
    @Body() body: { liked?: boolean },
    @Ip() ip: string,
    @Headers('x-forwarded-for') forwarded?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const user = await this.listening.resolveUser(authorization);
    this.signals.guardRate(
      clientIp(forwarded, ip),
      user ? `u:${user.id}` : null,
    );
    const result = await this.signals.setLike(id, user, body?.liked !== false);
    return { success: true, ...result };
  }

  @Post('playlists/:id/share')
  async share(
    @Param('id') id: string,
    @Body() body: { clientId?: string },
    @Ip() ip: string,
    @Headers('x-forwarded-for') forwarded?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const user = await this.listening.resolveUser(authorization);
    this.signals.guardRate(
      clientIp(forwarded, ip),
      user ? `u:${user.id}` : `c:${body?.clientId || ''}`,
    );
    return {
      success: true,
      ...(await this.signals.createShare(id, body?.clientId, user)),
    };
  }

  @Post('events/playlist-view')
  @HttpCode(202)
  async view(
    @Body() body: { playlistId?: string; clientId?: string; source?: string },
    @Ip() ip: string,
    @Headers('x-forwarded-for') forwarded?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const user = await this.listening.resolveUser(authorization);
    this.signals.guardRate(clientIp(forwarded, ip), null);
    return { success: await this.signals.recordView(body || {}, user) };
  }

  @Post('events/share-visit')
  @HttpCode(202)
  async shareVisit(
    @Body() body: { shareId?: string; playlistId?: string; clientId?: string },
    @Ip() ip: string,
    @Headers('x-forwarded-for') forwarded?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const user = await this.listening.resolveUser(authorization);
    this.signals.guardRate(clientIp(forwarded, ip), null);
    return { success: await this.signals.recordShareVisit(body || {}, user) };
  }

  @Post('recommend/feedback')
  async feedback(
    @Body()
    body: {
      itemType?: string;
      itemId?: string;
      artist?: string;
      clientId?: string;
    },
    @Ip() ip: string,
    @Headers('x-forwarded-for') forwarded?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const user = await this.listening.resolveUser(authorization);
    this.signals.guardRate(
      clientIp(forwarded, ip),
      user ? `u:${user.id}` : `c:${body?.clientId || ''}`,
    );
    return {
      success: await this.signals.recordNotInterested(body || {}, user),
    };
  }
}
