import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { AdminService, CuratedPlaylistDto } from './admin.service';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /** API Key 유효성 검증 (프론트엔드 로그인용) */
  @Post('verify')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  async verifyAdminKey(): Promise<{ success: boolean }> {
    return { success: true };
  }

  /** 전체 큐레이션 플레이리스트 목록 */
  @Get('playlists')
  @UseGuards(AdminGuard)
  async listPlaylists(): Promise<{
    success: boolean;
    data: CuratedPlaylistDto[];
  }> {
    const playlists = await this.adminService.listPlaylists();
    return { success: true, data: playlists };
  }

  /** 단일 플레이리스트 상세 */
  @Get('playlists/:id')
  @UseGuards(AdminGuard)
  async getPlaylist(
    @Param('id') id: string,
  ): Promise<{ success: boolean; data: CuratedPlaylistDto | null }> {
    const playlist = await this.adminService.getPlaylist(id);
    return { success: true, data: playlist };
  }

  /** 신규 플레이리스트 생성 */
  @Post('playlists')
  @UseGuards(AdminGuard)
  async createPlaylist(@Body() body: CuratedPlaylistDto): Promise<{
    success: boolean;
    data: CuratedPlaylistDto | null;
    message?: string;
  }> {
    try {
      const playlist = await this.adminService.createPlaylist(body);
      return { success: !!playlist, data: playlist };
    } catch (err: any) {
      return {
        success: false,
        data: null,
        message: err?.message || 'Create playlist failed',
      };
    }
  }

  /** 플레이리스트 수정 */
  @Patch('playlists/:id')
  @UseGuards(AdminGuard)
  async updatePlaylist(
    @Param('id') id: string,
    @Body() body: Partial<CuratedPlaylistDto>,
  ): Promise<{
    success: boolean;
    data: CuratedPlaylistDto | null;
    message?: string;
  }> {
    try {
      const playlist = await this.adminService.updatePlaylist(id, body);
      return { success: !!playlist, data: playlist };
    } catch (err: any) {
      return {
        success: false,
        data: null,
        message: err?.message || 'Update playlist failed',
      };
    }
  }

  /** 플레이리스트 삭제 */
  @Delete('playlists/:id')
  @UseGuards(AdminGuard)
  async deletePlaylist(@Param('id') id: string): Promise<{ success: boolean }> {
    const result = await this.adminService.deletePlaylist(id);
    return { success: result };
  }

  /** 플레이리스트 노출 순서 일괄 변경 */
  @Patch('playlists-reorder')
  @UseGuards(AdminGuard)
  async reorderPlaylists(
    @Body() body: { orderedIds: string[] },
  ): Promise<{ success: boolean }> {
    const result = await this.adminService.reorderPlaylists(
      body.orderedIds || [],
    );
    return { success: result };
  }

  /** 전체 공유 플레이리스트 목록 */
  @Get('user-playlists')
  @UseGuards(AdminGuard)
  async listUserPlaylists(): Promise<{ success: boolean; data: any[] }> {
    const playlists = await this.adminService.listUserPlaylists();
    return { success: true, data: playlists };
  }

  /** 단일 유저 플레이리스트 상세 */
  @Get('user-playlists/:id')
  @UseGuards(AdminGuard)
  async getUserPlaylist(
    @Param('id') id: string,
  ): Promise<{ success: boolean; data: any }> {
    const playlist = await this.adminService.getUserPlaylist(id);
    return { success: true, data: playlist };
  }

  /** 유저 플레이리스트 수정 */
  @Patch('user-playlists/:id')
  @UseGuards(AdminGuard)
  async updateUserPlaylist(
    @Param('id') id: string,
    @Body() body: any,
  ): Promise<{ success: boolean; data: any; message?: string }> {
    const playlist = await this.adminService.updateUserPlaylist(id, body);
    return { success: !!playlist, data: playlist };
  }

  /** 유저 플레이리스트 삭제 */
  @Delete('user-playlists/:id')
  @UseGuards(AdminGuard)
  async deleteUserPlaylist(
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    const result = await this.adminService.deleteUserPlaylist(id);
    return { success: result };
  }

  /** 대시보드 리스너 인사이트 (음원 불일치 리포트, 일일 인기 노래, 일일 인기 플레이리스트) */
  @Get('dashboard-insights')
  @UseGuards(AdminGuard)
  async getDashboardInsights(): Promise<{
    success: boolean;
    data: {
      mismatchTracks: any[];
      dailyTopSongs: any[];
      dailyTopPlaylists: any[];
    };
  }> {
    const data = await this.adminService.getDashboardInsights();
    return { success: true, data };
  }

  /** 음원 불일치 리포트 상태 처리 (해결 또는 미해결 복원) */
  @Post('resolve-mismatch')
  @UseGuards(AdminGuard)
  async resolveMismatch(
    @Body()
    body: {
      searchQuery?: string;
      youtube_video_id?: string;
      status?: 'resolved' | 'pending';
    },
  ): Promise<{ success: boolean }> {
    const result = await this.adminService.resolveMismatch(
      body?.searchQuery,
      body?.youtube_video_id,
      body?.status || 'resolved',
    );
    return result;
  }

  /** 전체 사용자 목록 조회 */
  @Get('users')
  @UseGuards(AdminGuard)
  async listUsers(): Promise<{ success: boolean; data: any[] }> {
    const users = await this.adminService.listUsers();
    return { success: true, data: users };
  }

  /** 단일 사용자 상세 조회 */
  @Get('users/:id')
  @UseGuards(AdminGuard)
  async getUser(
    @Param('id') id: string,
  ): Promise<{ success: boolean; data: any }> {
    const user = await this.adminService.getUser(id);
    return { success: !!user, data: user };
  }

  /** 사용자 정보 및 상태 수정 */
  @Patch('users/:id')
  @UseGuards(AdminGuard)
  async updateUser(
    @Param('id') id: string,
    @Body()
    body: Partial<{ nickname: string; is_banned: boolean; status: string }>,
  ): Promise<{ success: boolean; data: any }> {
    const result = await this.adminService.updateUser(id, body);
    return { success: !!result, data: result };
  }

  /** 사용자 삭제 */
  @Delete('users/:id')
  @UseGuards(AdminGuard)
  async deleteUser(@Param('id') id: string): Promise<{ success: boolean }> {
    const result = await this.adminService.deleteUser(id);
    return { success: result };
  }

  /** 사용자 요약 통계 지표 */
  @Get('user-stats')
  @UseGuards(AdminGuard)
  async getUserStats(): Promise<{ success: boolean; data: any }> {
    const stats = await this.adminService.getUserStats();
    return { success: true, data: stats };
  }

  // ══════════════════════════════════════════════════════════════
  // 검색어 순위 관리 API 엔드포인트 (Search Ranking Management)
  // ══════════════════════════════════════════════════════════════

  /** 검색어 순위 및 아티스트 순위, 고정/금지어, 통계 데이터 전체 조회 */
  @Get('search-ranking')
  @UseGuards(AdminGuard)
  async getSearchRanking(): Promise<{ success: boolean; data: any }> {
    const data = await this.adminService.getSearchRankingData();
    return { success: true, data };
  }

  /** 검색어 상위 고정(Pin) 등록 */
  @Post('search-ranking/pin')
  @UseGuards(AdminGuard)
  async pinSearchKeyword(
    @Body() body: { keyword: string; rank?: number },
  ): Promise<{ success: boolean; data?: any }> {
    const result = await this.adminService.pinSearchKeyword(body?.keyword, body?.rank);
    return result;
  }

  /** 검색어 상위 고정 해제 */
  @Delete('search-ranking/pin/:keyword')
  @UseGuards(AdminGuard)
  async unpinSearchKeyword(
    @Param('keyword') keyword: string,
  ): Promise<{ success: boolean; data?: any }> {
    const result = await this.adminService.unpinSearchKeyword(keyword);
    return result;
  }

  /** 검색어 금지어(블랙리스트) 추가 */
  @Post('search-ranking/blacklist')
  @UseGuards(AdminGuard)
  async addBlacklistKeyword(
    @Body() body: { keyword: string; reason?: string },
  ): Promise<{ success: boolean; data?: any }> {
    const result = await this.adminService.addBlacklistSearchKeyword(body?.keyword, body?.reason);
    return result;
  }

  /** 검색어 금지어 해제 */
  @Delete('search-ranking/blacklist/:keyword')
  @UseGuards(AdminGuard)
  async removeBlacklistKeyword(
    @Param('keyword') keyword: string,
  ): Promise<{ success: boolean; data?: any }> {
    const result = await this.adminService.removeBlacklistSearchKeyword(keyword);
    return result;
  }

  /** 수동 검색어 등록 또는 점수 수정 */
  @Post('search-ranking/keyword')
  @UseGuards(AdminGuard)
  async addOrUpdateSearchKeyword(
    @Body() body: { keyword: string; count: number },
  ): Promise<{ success: boolean; keyword?: string; count?: number }> {
    const result = await this.adminService.addOrUpdateSearchKeyword(body?.keyword, body?.count);
    return result;
  }

  /** 검색어 삭제 */
  @Delete('search-ranking/keyword/:keyword')
  @UseGuards(AdminGuard)
  async deleteSearchKeyword(
    @Param('keyword') keyword: string,
  ): Promise<{ success: boolean }> {
    const result = await this.adminService.deleteSearchKeyword(keyword);
    return result;
  }

  /** 실시간 순위 강제 재계산 */
  @Post('search-ranking/recalculate')
  @UseGuards(AdminGuard)
  async recalculateSearchRankings(): Promise<{ success: boolean }> {
    const result = await this.adminService.recalculateSearchRankings();
    return result;
  }

  /** 검색 로그 초기화 */
  @Post('search-ranking/clear-logs')
  @UseGuards(AdminGuard)
  async clearSearchLogs(): Promise<{ success: boolean }> {
    const result = await this.adminService.clearSearchLogs();
    return result;
  }
}

