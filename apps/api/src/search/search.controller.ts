import { Controller, Get, Post, Body, Query, Headers, Req } from '@nestjs/common';
import type { Request } from 'express';
import { SearchService, TrendingKeywordItem, TrendingArtistItem, SearchLogArtistDto } from './search.service';

class LogSearchDto {
  keyword: string;
  clientId?: string;
  userId?: string;
  isGuest?: boolean;
  artists?: SearchLogArtistDto[];
}

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  /**
   * 사용자 검색어 및 아티스트 로깅
   * POST /api/search/log
   */
  @Post('log')
  async logSearch(
    @Body() body: LogSearchDto,
    @Req() req: any,
    @Headers('x-client-id') clientIdHeader?: string,
  ): Promise<{ success: boolean; isCounted?: boolean; filterReason?: string }> {
    const keyword = body?.keyword || '';
    const artists = body?.artists || [];
    const userId = body?.userId;
    const isGuest = Boolean(body?.isGuest);

    // 클라이언트 식별자 우선순위: 1) userId 2) body.clientId 3) x-client-id 헤더 4) IP 주소
    let clientId = body?.clientId || clientIdHeader;
    if (!clientId) {
      const rawIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || '127.0.0.1';
      const ip = Array.isArray(rawIp) ? rawIp[0] : rawIp.split(',')[0].trim();
      clientId = `guest_${ip.replace(/[^a-zA-Z0-9]/g, '_')}`;
    }

    return this.searchService.logSearchKeyword(keyword, clientId, artists, userId, isGuest);
  }

  /**
   * 실시간 인기 검색어 & 인기 아티스트 Top 10 조회
   * GET /api/search/trending
   */
  @Get('trending')
  async getTrending(
    @Query('limit') limit?: string,
  ): Promise<{
    success: boolean;
    data: TrendingKeywordItem[];
    artists: TrendingArtistItem[];
  }> {
    const limitNum = limit ? Math.min(20, Math.max(1, parseInt(limit, 10))) : 10;
    const [data, artists] = await Promise.all([
      this.searchService.getTrendingKeywords(limitNum),
      this.searchService.getTrendingArtists(limitNum),
    ]);

    return {
      success: true,
      data,
      artists,
    };
  }

  /**
   * 실시간 인기 아티스트 전용 조회
   * GET /api/search/trending-artists
   */
  @Get('trending-artists')
  async getTrendingArtists(
    @Query('limit') limit?: string,
  ): Promise<{ success: boolean; data: TrendingArtistItem[] }> {
    const limitNum = limit ? Math.min(20, Math.max(1, parseInt(limit, 10))) : 10;
    const data = await this.searchService.getTrendingArtists(limitNum);
    return {
      success: true,
      data,
    };
  }
}

