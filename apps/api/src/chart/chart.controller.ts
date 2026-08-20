import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { ChartService, ChartTrack, CategoryPlaylist } from './chart.service';

@Controller('chart')
export class ChartController {
  constructor(private readonly chartService: ChartService) {}

  @Get('top')
  async getTopCharts(
    @Query('limit') limit?: string,
  ): Promise<{ success: boolean; count: number; data: ChartTrack[] }> {
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    const tracks = await this.chartService.getTopCharts(parsedLimit);
    return {
      success: true,
      count: tracks.length,
      data: tracks,
    };
  }

  @Get('popular')
  async getPopularRankings(
    @Query('limit') limit?: string,
  ): Promise<{ success: boolean; count: number; data: ChartTrack[] }> {
    const parsedLimit = limit ? parseInt(limit, 10) : 100;
    const tracks = await this.chartService.getPopularRankings(parsedLimit);
    return {
      success: true,
      count: tracks.length,
      data: tracks,
    };
  }

  @Get('categories')
  async getCategoryPlaylists(): Promise<{
    success: boolean;
    count: number;
    data: CategoryPlaylist[];
  }> {
    const playlists = await this.chartService.getCuratedCategoryPlaylists();
    return {
      success: true,
      count: playlists.length,
      data: playlists,
    };
  }

  @Get('youtube-curated')
  async getCuratedYoutubePlaylists(): Promise<{
    success: boolean;
    count: number;
    data: CategoryPlaylist[];
  }> {
    const playlists = await this.chartService.getCuratedYoutubePlaylists();
    return {
      success: true,
      count: playlists.length,
      data: playlists,
    };
  }

  // 기존 youtube-curated 경로는 호환성을 위해 유지한다. 새 클라이언트는 후보 생성의
  // 실제 역할을 드러내는 아래 경로를 사용한다.
  @Get('theme-candidates')
  async getThemeCandidates(): Promise<{
    success: boolean;
    count: number;
    data: CategoryPlaylist[];
  }> {
    const playlists = await this.chartService.getCuratedYoutubePlaylists();
    return {
      success: true,
      count: playlists.length,
      data: playlists,
    };
  }

  @Post('play-log')
  async recordPlayLog(
    @Body()
    body: {
      custom_title?: string;
      custom_artist?: string;
      searchQuery?: string;
      youtube_video_id?: string;
      playedSec?: number;
      clientId?: string;
      userId?: string;
    },
  ): Promise<{ success: boolean }> {
    this.chartService.recordPlayLog(body || {});
    return { success: true };
  }

  @Post('match-feedback')
  async recordMatchFeedback(
    @Body()
    body: {
      searchQuery?: string;
      youtube_video_id?: string;
      isCorrect: boolean;
      custom_title?: string;
      custom_artist?: string;
      artwork?: string;
      cover?: string;
      userId?: string;
      isGuest?: boolean;
    },
  ): Promise<{ success: boolean; message?: string }> {
    return this.chartService.recordMatchFeedback(body || { isCorrect: false });
  }

  @Get('song-mapping')
  async getSongMapping(
    @Query('query') query?: string,
    @Query('trackId') trackId?: string,
  ): Promise<{ success: boolean; data: any }> {
    const data = await this.chartService.getSongMapping(query || '', trackId);
    return { success: true, data };
  }

  @Post('song-mapping')
  async saveSongMapping(
    @Body()
    body: {
      query: string;
      trackId?: string;
      youtube_video_id: string;
      durationSec?: number;
    },
  ): Promise<{ success: boolean; data: any }> {
    return this.chartService.saveSongMapping(
      body || { query: '', youtube_video_id: '' },
    );
  }

  @Post('delete-song-mapping')
  async deleteSongMapping(
    @Body() body: { query?: string; trackId?: string },
  ): Promise<{ success: boolean }> {
    return this.chartService.deleteSongMapping(body.query || '', body.trackId);
  }

  @Get('search-itunes')
  async searchItunes(
    @Query('q') query?: string,
  ): Promise<{ success: boolean; count: number; data: any[] }> {
    if (!query) return { success: false, count: 0, data: [] };
    const results = await this.chartService.searchItunes(query);
    return {
      success: true,
      count: results.length,
      data: results,
    };
  }

  @Get('search-youtube')
  async searchYoutubeKeyless(
    @Query('q') query?: string,
    @Query('duration') duration?: string,
    @Query('exclude') exclude?: string,
  ): Promise<{ success: boolean; count: number; data: any[] }> {
    if (!query) return { success: false, count: 0, data: [] };
    const targetDurationSec = duration ? parseInt(duration, 10) : 0;
    const excludeVideoIds = exclude
      ? exclude
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      : [];
    const results = await this.chartService.searchYoutubeKeyless(
      query,
      targetDurationSec,
      excludeVideoIds,
    );
    return {
      success: true,
      count: results.length,
      data: results,
    };
  }

  @Get('clear-cache')
  async clearResolutionCache(): Promise<{
    success: boolean;
    clearedCount: number;
  }> {
    const res = await this.chartService.clearResolutionCache();
    return {
      success: true,
      clearedCount: res.clearedCount,
    };
  }

  @Get('refresh')
  async forceRefresh(
    @Query('clearCache') clearCache?: string,
  ): Promise<{ success: boolean; count: number; data: ChartTrack[] }> {
    const shouldClear = clearCache === 'true' || clearCache === '1';
    const tracks = await this.chartService.forceRefresh(shouldClear);
    return {
      success: true,
      count: tracks.length,
      data: tracks,
    };
  }

  @Get('durations')
  async getVideodurations(
    @Query('ids') ids?: string,
  ): Promise<{ success: boolean; data: Record<string, number> }> {
    if (!ids) return { success: false, data: {} };
    const videoIds = ids
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    if (videoIds.length === 0) return { success: false, data: {} };
    const data = await this.chartService.getDurations(videoIds);
    return { success: true, data };
  }
}
