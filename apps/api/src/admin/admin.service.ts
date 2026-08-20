import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ChartService, MismatchReport } from '../chart/chart.service';
import { SearchService } from '../search/search.service';

export class CuratedTrackDto {
  id?: string;
  custom_title: string;
  custom_artist: string;
  artwork?: string | null;
  youtube_video_id?: string;
  durationSec?: number;
  searchQuery?: string;
}

export class CuratedPlaylistDto {
  id?: string;
  category: 'theme' | 'situation' | 'genre';
  category_label?: string;
  title: string;
  subtitle?: string;
  cover?: string;
  tag?: string;
  author?: string;
  display_order?: number;
  is_active?: boolean;
  tracks?: CuratedTrackDto[];
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly chartService: ChartService,
    private readonly searchService: SearchService,
  ) {}


  private getSupabaseConfig() {
    const url = process.env.SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    return { url, key };
  }

  private getHeaders() {
    const { key } = this.getSupabaseConfig();
    return {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Prefer: 'return=representation',
    };
  }

  /** 전체 큐레이션 플레이리스트 목록 조회 */
  async listPlaylists(): Promise<CuratedPlaylistDto[]> {
    const { url } = this.getSupabaseConfig();
    const headers = this.getHeaders();

    try {
      const response = await fetch(
        `${url}/rest/v1/curated_playlists?order=display_order.asc,created_at.desc&select=id,category,category_label,title,subtitle,cover,tag,author,display_order,is_active,tracks,created_at,updated_at`,
        { headers },
      );

      if (!response.ok) {
        const errText = await response.text();
        this.logger.warn(
          `[Admin] List playlists failed: ${response.status} ${errText}`,
        );
        return [];
      }

      return await response.json();
    } catch (error: any) {
      this.logger.error(
        `[Admin] List playlists error: ${error?.message || error}`,
      );
      return [];
    }
  }

  /** 단일 플레이리스트 상세 조회 */
  async getPlaylist(id: string): Promise<CuratedPlaylistDto | null> {
    const { url } = this.getSupabaseConfig();
    const headers = this.getHeaders();

    try {
      const response = await fetch(
        `${url}/rest/v1/curated_playlists?id=eq.${encodeURIComponent(id)}&select=*`,
        { headers },
      );

      if (!response.ok) {
        this.logger.warn(`[Admin] Get playlist failed: ${response.status}`);
        return null;
      }

      const rows = await response.json();
      if (!rows || rows.length === 0) return null;
      return rows[0];
    } catch (error: any) {
      this.logger.error(
        `[Admin] Get playlist error: ${error?.message || error}`,
      );
      return null;
    }
  }

  /** 신규 플레이리스트 생성 */
  async createPlaylist(
    data: CuratedPlaylistDto,
  ): Promise<CuratedPlaylistDto | null> {
    const { url } = this.getSupabaseConfig();
    const headers = this.getHeaders();

    // ID가 없으면 자동 생성
    const rawId = data.id && data.id.trim() ? data.id.trim() : '';
    const id = rawId || `sofar-${data.category || 'theme'}-${Date.now()}`;
    const now = new Date().toISOString();

    const body = {
      id,
      category: data.category || 'theme',
      category_label: data.category_label || 'sofar',
      title: data.title,
      subtitle: data.subtitle || '',
      cover: data.cover || '',
      tag: data.tag || '',
      author: data.author || 'sofar',
      display_order: data.display_order ?? 0,
      is_active: data.is_active ?? false,
      tracks: data.tracks || [],
      created_at: now,
      updated_at: now,
    };

    try {
      this.logger.log(
        `[Admin] Sending create request to Supabase: ${id} (${data.title})`,
      );
      const response = await fetch(`${url}/rest/v1/curated_playlists`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errText = await response.text();
        this.logger.error(
          `[Admin] Create playlist failed: HTTP ${response.status} - ${errText}`,
        );
        throw new Error(`Supabase HTTP ${response.status}: ${errText}`);
      }

      const rows = await response.json();
      return rows?.[0] || null;
    } catch (error: any) {
      this.logger.error(
        `[Admin] Create playlist exception: ${error?.message || error}`,
      );
      throw error;
    }
  }

  /** 플레이리스트 수정 */
  async updatePlaylist(
    id: string,
    data: Partial<CuratedPlaylistDto>,
  ): Promise<CuratedPlaylistDto | null> {
    const { url } = this.getSupabaseConfig();
    const headers = this.getHeaders();

    const body: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (data.category !== undefined) body.category = data.category;
    if (data.category_label !== undefined)
      body.category_label = data.category_label;
    if (data.title !== undefined) body.title = data.title;
    if (data.subtitle !== undefined) body.subtitle = data.subtitle;
    if (data.cover !== undefined) body.cover = data.cover;
    if (data.tag !== undefined) body.tag = data.tag;
    if (data.author !== undefined) body.author = data.author;
    if (data.display_order !== undefined)
      body.display_order = data.display_order;
    if (data.is_active !== undefined) body.is_active = data.is_active;
    if (data.tracks !== undefined) body.tracks = data.tracks;

    try {
      const response = await fetch(
        `${url}/rest/v1/curated_playlists?id=eq.${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          headers,
          body: JSON.stringify(body),
        },
      );

      if (!response.ok) {
        const errText = await response.text();
        this.logger.warn(
          `[Admin] Update playlist failed: ${response.status} ${errText}`,
        );
        return null;
      }

      const rows = await response.json();
      if (!rows || rows.length === 0) {
        throw new NotFoundException(`Playlist not found: ${id}`);
      }
      return rows[0];
    } catch (error: any) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(
        `[Admin] Update playlist error: ${error?.message || error}`,
      );
      return null;
    }
  }

  /** 플레이리스트 삭제 */
  async deletePlaylist(id: string): Promise<boolean> {
    const { url } = this.getSupabaseConfig();
    const headers = this.getHeaders();

    try {
      const response = await fetch(
        `${url}/rest/v1/curated_playlists?id=eq.${encodeURIComponent(id)}`,
        {
          method: 'DELETE',
          headers,
        },
      );

      if (!response.ok) {
        const errText = await response.text();
        this.logger.warn(
          `[Admin] Delete playlist failed: ${response.status} ${errText}`,
        );
        return false;
      }

      this.logger.log(`[Admin] Deleted playlist: ${id}`);
      return true;
    } catch (error: any) {
      this.logger.error(
        `[Admin] Delete playlist error: ${error?.message || error}`,
      );
      return false;
    }
  }

  /** 플레이리스트 노출 순서 일괄 변경 */
  async reorderPlaylists(orderedIds: string[]): Promise<boolean> {
    const { url } = this.getSupabaseConfig();
    const headers = this.getHeaders();

    try {
      // 각 ID에 대해 display_order를 인덱스 순서로 업데이트
      const updates = orderedIds.map((id, index) =>
        fetch(
          `${url}/rest/v1/curated_playlists?id=eq.${encodeURIComponent(id)}`,
          {
            method: 'PATCH',
            headers: { ...headers, Prefer: 'return=minimal' },
            body: JSON.stringify({
              display_order: index,
              updated_at: new Date().toISOString(),
            }),
          },
        ),
      );

      const results = await Promise.all(updates);
      const allOk = results.every((r) => r.ok);

      if (!allOk) {
        this.logger.warn('[Admin] Some reorder updates failed.');
      }

      return allOk;
    } catch (error: any) {
      this.logger.error(
        `[Admin] Reorder playlists error: ${error?.message || error}`,
      );
      return false;
    }
  }

  private async getUsersMap(): Promise<Map<string, string>> {
    const userMap = new Map<string, string>();
    const { url } = this.getSupabaseConfig();
    const headers = this.getHeaders();

    try {
      const authRes = await fetch(`${url}/auth/v1/admin/users`, { headers });
      if (authRes.ok) {
        const json = await authRes.json();
        const users = json.users || json || [];
        if (Array.isArray(users)) {
          users.forEach((u: any) => {
            const nickname =
              u.user_metadata?.full_name ||
              u.user_metadata?.name ||
              u.user_metadata?.nickname ||
              (u.email ? u.email.split('@')[0] : null);
            if (u.id && nickname) {
              userMap.set(u.id, nickname);
            }
          });
        }
      }

      const profileRes = await fetch(
        `${url}/rest/v1/profiles?select=id,full_name,name,nickname,email`,
        { headers },
      );
      if (profileRes.ok) {
        const profiles = await profileRes.json();
        if (Array.isArray(profiles)) {
          profiles.forEach((p: any) => {
            const nickname =
              p.nickname ||
              p.full_name ||
              p.name ||
              (p.email ? p.email.split('@')[0] : null);
            if (p.id && nickname) {
              userMap.set(p.id, nickname);
            }
          });
        }
      }
    } catch (err: any) {
      this.logger.warn(`[Admin] Fetch users map error: ${err?.message || err}`);
    }

    return userMap;
  }

  /** 전체 공유 플레이리스트 목록 조회 */
  async listUserPlaylists(): Promise<any[]> {
    const { url } = this.getSupabaseConfig();
    const headers = this.getHeaders();
    const usersMap = await this.getUsersMap();

    try {
      let rawPlaylists: any[] = [];
      const response = await fetch(
        `${url}/rest/v1/playlists?is_public=eq.true&order=created_at.desc&select=id,user_id,title,cover_url,is_public,created_at,author,tracks(id,custom_title,custom_artist,youtube_video_id,sequence)`,
        { headers },
      );

      if (response.ok) {
        rawPlaylists = await response.json();
      }

      return rawPlaylists.map((pl: any) => {
        const userNickname = pl.user_id ? usersMap.get(pl.user_id) : null;
        const author =
          pl.author ||
          userNickname ||
          (pl.user_id ? `유저 (${pl.user_id.substring(0, 6)})` : '공유 사용자');
        const cover = pl.cover || pl.cover_url || null;
        return {
          ...pl,
          cover,
          cover_url: cover,
          is_public: pl.is_public !== false,
          is_active:
            pl.is_active !== undefined ? pl.is_active : pl.is_public !== false,
          author,
          user_nickname: userNickname || author,
          owner_nickname: userNickname || author,
        };
      });
    } catch (error: any) {
      this.logger.error(
        `[Admin] List user playlists error: ${error?.message || error}`,
      );
      return [];
    }
  }

  /** 단일 유저 플레이리스트 상세 조회 */
  async getUserPlaylist(id: string): Promise<any | null> {
    const { url } = this.getSupabaseConfig();
    const headers = this.getHeaders();
    const usersMap = await this.getUsersMap();

    try {
      let pl: any = null;
      const response = await fetch(
        `${url}/rest/v1/playlists?id=eq.${encodeURIComponent(id)}&select=id,user_id,title,cover_url,is_public,created_at,author,tracks(id,custom_title,custom_artist,youtube_video_id,sequence)`,
        { headers },
      );

      if (response.ok) {
        const rows = await response.json();
        if (rows && rows.length > 0) pl = rows[0];
      }

      if (!pl) return null;

      const userNickname = pl.user_id ? usersMap.get(pl.user_id) : null;
      const author =
        pl.author ||
        userNickname ||
        (pl.user_id ? `유저 (${pl.user_id.substring(0, 6)})` : '공유 사용자');
      const cover = pl.cover || pl.cover_url || null;
      return {
        ...pl,
        cover,
        cover_url: cover,
        is_public: pl.is_public !== false,
        is_active:
          pl.is_active !== undefined ? pl.is_active : pl.is_public !== false,
        author,
        user_nickname: userNickname || author,
        owner_nickname: userNickname || author,
      };
    } catch (error: any) {
      this.logger.error(
        `[Admin] Get user playlist error: ${error?.message || error}`,
      );
      return null;
    }
  }

  /** 유저 플레이리스트 수정 (노출 여부, 공개 여부, 제목 등) */
  async updateUserPlaylist(
    id: string,
    data: Partial<{
      title: string;
      is_public: boolean;
      is_active: boolean;
      cover_url: string;
    }>,
  ): Promise<any | null> {
    const { url } = this.getSupabaseConfig();
    const headers = this.getHeaders();

    try {
      const updatePayload: Record<string, any> = {};
      if (data.title !== undefined) updatePayload.title = data.title;
      if (data.cover_url !== undefined)
        updatePayload.cover_url = data.cover_url;

      // 유저 플레이리스트 노출 상태의 DB 컬럼은 is_public 이 기본값
      if (data.is_public !== undefined) {
        updatePayload.is_public = data.is_public;
      } else if (data.is_active !== undefined) {
        updatePayload.is_public = data.is_active;
      }

      const response = await fetch(
        `${url}/rest/v1/playlists?id=eq.${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          headers,
          body: JSON.stringify(updatePayload),
        },
      );

      if (!response.ok) {
        const errText = await response.text();
        this.logger.warn(
          `[Admin] Update user playlist failed: ${response.status} ${errText}`,
        );
        return null;
      }

      const rows = await response.json();
      return rows && rows.length > 0 ? rows[0] : null;
    } catch (error: any) {
      this.logger.error(
        `[Admin] Update user playlist error: ${error?.message || error}`,
      );
      return null;
    }
  }

  /** 유저 플레이리스트 삭제 */
  async deleteUserPlaylist(id: string): Promise<boolean> {
    const { url } = this.getSupabaseConfig();
    const headers = this.getHeaders();

    try {
      await fetch(
        `${url}/rest/v1/tracks?playlist_id=eq.${encodeURIComponent(id)}`,
        { method: 'DELETE', headers },
      );
      const response = await fetch(
        `${url}/rest/v1/playlists?id=eq.${encodeURIComponent(id)}`,
        { method: 'DELETE', headers },
      );

      return response.ok;
    } catch (error: any) {
      this.logger.error(
        `[Admin] Delete user playlist error: ${error?.message || error}`,
      );
      return false;
    }
  }

  /** 대시보드 리스너 인사이트 (불일치 리포트, 일일 인기 노래, 일일 인기 플레이리스트, 실무 마케팅 지표) */
  async getDashboardInsights(): Promise<{
    mismatchTracks: MismatchReport[];
    dailyTopSongs: any[];
    dailyTopPlaylists: any[];
    marketingMetrics: any;
  }> {
    try {
      const [
        curatedPlaylists,
        userPlaylists,
        users,
        mismatchTracks,
        dailyTopSongs,
      ] = await Promise.all([
        this.listPlaylists(),
        this.listUserPlaylists(),
        this.listUsers(),
        this.chartService.getMismatchReports(20),
        this.chartService.getDailyTopSongs(10),
      ]);

      const totalUsers = users.length;
      const activeUsersCount = users.filter((u) => !u.is_banned).length;
      const usersWithPlaylists = users.filter(
        (u) => (u.playlist_count || 0) > 0,
      ).length;

      const [dailyTopPlaylists, marketingMetrics] = await Promise.all([
        this.chartService.getDailyTopPlaylists(
          curatedPlaylists,
          userPlaylists,
          5,
        ),
        this.chartService.getMarketingMetrics(
          totalUsers,
          activeUsersCount,
          usersWithPlaylists,
        ),
      ]);

      return {
        mismatchTracks,
        dailyTopSongs,
        dailyTopPlaylists,
        marketingMetrics,
      };
    } catch (error: any) {
      this.logger.error(
        `[Admin] getDashboardInsights error: ${error?.message || error}`,
      );
      return {
        mismatchTracks: [],
        dailyTopSongs: [],
        dailyTopPlaylists: [],
        marketingMetrics: null,
      };
    }
  }

  /** 불일치 리포트 건 상태 처리 (해결 또는 미해결 복원) */
  async resolveMismatch(
    searchQuery?: string,
    youtube_video_id?: string,
    targetStatus: 'resolved' | 'pending' = 'resolved',
  ): Promise<{ success: boolean }> {
    return this.chartService.resolveMismatchFeedback(
      searchQuery,
      youtube_video_id,
      targetStatus,
    );
  }

  /** 전체 사용자 목록 조회 */
  async listUsers(): Promise<any[]> {
    const { url } = this.getSupabaseConfig();
    const headers = this.getHeaders();

    try {
      let authUsers: any[] = [];
      const profilesMap = new Map<string, any>();
      const playlistsCountMap = new Map<
        string,
        { playlistCount: number; trackCount: number }
      >();

      // 1. Supabase Auth 사용자 목록 가져오기
      if (url && headers.apikey) {
        try {
          const authRes = await fetch(
            `${url}/auth/v1/admin/users?per_page=1000`,
            { headers },
          );
          if (authRes.ok) {
            const authJson = await authRes.json();
            authUsers =
              authJson.users || (Array.isArray(authJson) ? authJson : []);
          }
        } catch (e) {
          this.logger.warn(`[Admin] Auth users fetch failed: ${e}`);
        }

        // 2. profiles 테이블 조회
        try {
          const profileRes = await fetch(`${url}/rest/v1/profiles?select=*`, {
            headers,
          });
          if (profileRes.ok) {
            const profiles = await profileRes.json();
            if (Array.isArray(profiles)) {
              profiles.forEach((p: any) => {
                if (p.id) profilesMap.set(p.id, p);
              });
            }
          }
        } catch (e) {
          this.logger.warn(`[Admin] Profiles fetch failed: ${e}`);
        }

        // 3. 사용자별 플레이리스트 및 트랙 집계
        try {
          const plRes = await fetch(
            `${url}/rest/v1/playlists?select=id,user_id,tracks(id)`,
            { headers },
          );
          if (plRes.ok) {
            const pls = await plRes.json();
            if (Array.isArray(pls)) {
              pls.forEach((pl: any) => {
                if (pl.user_id) {
                  const current = playlistsCountMap.get(pl.user_id) || {
                    playlistCount: 0,
                    trackCount: 0,
                  };
                  const trCount = Array.isArray(pl.tracks)
                    ? pl.tracks.length
                    : 0;
                  playlistsCountMap.set(pl.user_id, {
                    playlistCount: current.playlistCount + 1,
                    trackCount: current.trackCount + trCount,
                  });
                }
              });
            }
          }
        } catch (e) {
          this.logger.warn(`[Admin] Playlists count fetch failed: ${e}`);
        }
      }

      // Supabase 데이터가 있거나 profiles가 있는 경우 조합
      const userList: any[] = [];
      const handledUserIds = new Set<string>();

      // Auth users 처리
      authUsers.forEach((u: any) => {
        handledUserIds.add(u.id);
        const profile = profilesMap.get(u.id) || {};
        const stats = playlistsCountMap.get(u.id) || {
          playlistCount: 0,
          trackCount: 0,
        };

        const nickname =
          profile.nickname ||
          profile.full_name ||
          profile.username ||
          profile.name ||
          u.user_metadata?.full_name ||
          u.user_metadata?.name ||
          u.user_metadata?.nickname ||
          (u.email ? u.email.split('@')[0] : '사용자');

        const avatar =
          profile.avatar_url ||
          profile.avatar ||
          u.user_metadata?.avatar_url ||
          u.user_metadata?.picture ||
          null;

        const provider =
          u.app_metadata?.provider ||
          (u.identities && u.identities.length > 0
            ? u.identities[0]?.provider
            : null) ||
          (u.email?.includes('google') ? 'google' : 'email');

        const isBanned = !!(
          u.banned_until ||
          u.user_metadata?.is_banned ||
          profile.is_banned
        );

        userList.push({
          id: u.id,
          email: u.email || profile.email || '이메일 없음',
          nickname,
          avatar_url: avatar,
          provider: provider === 'google' ? 'google' : 'email',
          created_at:
            u.created_at || profile.created_at || new Date().toISOString(),
          last_sign_in_at:
            u.last_sign_in_at || u.updated_at || profile.updated_at || null,
          playlist_count: stats.playlistCount,
          track_count: stats.trackCount,
          is_banned: isBanned,
          status: isBanned ? 'banned' : 'active',
          role: u.role || 'user',
        });
      });

      // profiles 테이블에만 있고 authUsers에 누락된 경우 처리
      profilesMap.forEach((profile, id) => {
        if (!handledUserIds.has(id)) {
          handledUserIds.add(id);
          const stats = playlistsCountMap.get(id) || {
            playlistCount: 0,
            trackCount: 0,
          };
          const nickname =
            profile.nickname ||
            profile.full_name ||
            profile.username ||
            profile.name ||
            (profile.email ? profile.email.split('@')[0] : '사용자');
          const isBanned = !!profile.is_banned;

          userList.push({
            id,
            email: profile.email || '이메일 없음',
            nickname,
            avatar_url: profile.avatar_url || profile.avatar || null,
            provider: profile.email?.includes('gmail') ? 'google' : 'email',
            created_at: profile.created_at || new Date().toISOString(),
            last_sign_in_at: profile.updated_at || null,
            playlist_count: stats.playlistCount,
            track_count: stats.trackCount,
            is_banned: isBanned,
            status: isBanned ? 'banned' : 'active',
            role: 'user',
          });
        }
      });

      // 만약 조회된 사용자가 없다면, 관리자 콘솔 시연 및 로컬 개발용 샘플 데이터 생성
      if (userList.length === 0) {
        return this.getMockUsers();
      }

      // 최신 가입순 정렬
      return userList.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    } catch (error: any) {
      this.logger.error(`[Admin] List users error: ${error?.message || error}`);
      return this.getMockUsers();
    }
  }

  /** 단일 사용자 상세 조회 */
  async getUser(id: string): Promise<any | null> {
    const { url } = this.getSupabaseConfig();
    const headers = this.getHeaders();

    try {
      let user: any = null;
      const users = await this.listUsers();
      user = users.find((u) => u.id === id);

      if (!user) {
        return null;
      }

      // 사용자의 플레이리스트 목록 조회
      let userPlaylists: any[] = [];
      if (url && headers.apikey) {
        const plRes = await fetch(
          `${url}/rest/v1/playlists?user_id=eq.${encodeURIComponent(id)}&order=created_at.desc&select=id,title,cover_url,is_public,created_at,tracks(id,custom_title,custom_artist,youtube_video_id)`,
          { headers },
        );
        if (plRes.ok) {
          userPlaylists = await plRes.json();
        }
      }

      return {
        ...user,
        playlists: userPlaylists,
      };
    } catch (error: any) {
      this.logger.error(`[Admin] Get user error: ${error?.message || error}`);
      return null;
    }
  }

  /** 사용자 정보 및 상태 수정 */
  async updateUser(
    id: string,
    data: Partial<{ nickname: string; is_banned: boolean; status: string }>,
  ): Promise<any | null> {
    const { url } = this.getSupabaseConfig();
    const headers = this.getHeaders();

    try {
      const isBanned =
        data.is_banned !== undefined
          ? data.is_banned
          : data.status === 'banned';

      // 1. profiles 테이블 업데이트
      if (url && headers.apikey) {
        const updatePayload: Record<string, any> = {
          updated_at: new Date().toISOString(),
        };
        if (data.nickname !== undefined) updatePayload.nickname = data.nickname;
        if (isBanned !== undefined) updatePayload.is_banned = isBanned;

        await fetch(`${url}/rest/v1/profiles?id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(updatePayload),
        });

        // 2. Supabase Auth 사용자 메타데이터 업데이트 (선택적)
        try {
          await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              user_metadata: {
                full_name: data.nickname,
                is_banned: isBanned,
              },
              ban_duration: isBanned ? '876000h' : 'none', // 100년 정지 or 해제
            }),
          });
        } catch (e) {
          // auth api 권한 없어도 진행
        }
      }

      return {
        id,
        success: true,
        ...data,
        is_banned: isBanned,
        status: isBanned ? 'banned' : 'active',
      };
    } catch (error: any) {
      this.logger.error(
        `[Admin] Update user error: ${error?.message || error}`,
      );
      return null;
    }
  }

  /** 사용자 삭제 */
  async deleteUser(id: string): Promise<boolean> {
    const { url } = this.getSupabaseConfig();
    const headers = this.getHeaders();

    try {
      if (url && headers.apikey) {
        // 연관 트랙 및 플레이리스트 정리
        const plRes = await fetch(
          `${url}/rest/v1/playlists?user_id=eq.${encodeURIComponent(id)}&select=id`,
          { headers },
        );
        if (plRes.ok) {
          const pls = await plRes.json();
          if (Array.isArray(pls)) {
            for (const pl of pls) {
              await fetch(
                `${url}/rest/v1/tracks?playlist_id=eq.${encodeURIComponent(pl.id)}`,
                { method: 'DELETE', headers },
              );
            }
          }
        }
        await fetch(
          `${url}/rest/v1/playlists?user_id=eq.${encodeURIComponent(id)}`,
          { method: 'DELETE', headers },
        );
        await fetch(`${url}/rest/v1/profiles?id=eq.${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers,
        });

        // Supabase Auth 유저 삭제
        await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers,
        });
      }

      return true;
    } catch (error: any) {
      this.logger.error(
        `[Admin] Delete user error: ${error?.message || error}`,
      );
      return false;
    }
  }

  /** 사용자 통계 요약 지표 */
  async getUserStats(): Promise<{
    totalUsers: number;
    activeUsers: number;
    bannedUsers: number;
    newUsersThisWeek: number;
    googleUsersCount: number;
    emailUsersCount: number;
    totalUserPlaylists: number;
    totalUserTracks: number;
  }> {
    const users = await this.listUsers();
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const totalUsers = users.length;
    const activeUsers = users.filter((u) => !u.is_banned).length;
    const bannedUsers = users.filter((u) => u.is_banned).length;
    const newUsersThisWeek = users.filter(
      (u) => new Date(u.created_at) >= oneWeekAgo,
    ).length;
    const googleUsersCount = users.filter(
      (u) => u.provider === 'google',
    ).length;
    const emailUsersCount = users.filter((u) => u.provider === 'email').length;
    const totalUserPlaylists = users.reduce(
      (sum, u) => sum + (u.playlist_count || 0),
      0,
    );
    const totalUserTracks = users.reduce(
      (sum, u) => sum + (u.track_count || 0),
      0,
    );

    return {
      totalUsers,
      activeUsers,
      bannedUsers,
      newUsersThisWeek,
      googleUsersCount,
      emailUsersCount,
      totalUserPlaylists,
      totalUserTracks,
    };
  }

  /** 데모 및 로컬 환경용 Mock Users */
  private getMockUsers(): any[] {
    const now = new Date();
    return [
      {
        id: 'usr_mock_001',
        email: 'minji.kim@sofar.music',
        nickname: '민지 (Minji)',
        avatar_url:
          'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        provider: 'google',
        created_at: new Date(
          now.getTime() - 1000 * 60 * 60 * 24 * 3,
        ).toISOString(),
        last_sign_in_at: new Date(now.getTime() - 1000 * 60 * 30).toISOString(),
        playlist_count: 5,
        track_count: 42,
        is_banned: false,
        status: 'active',
        role: 'user',
      },
      {
        id: 'usr_mock_002',
        email: 'jazzlover99@gmail.com',
        nickname: '심야 재즈 카페',
        avatar_url:
          'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
        provider: 'google',
        created_at: new Date(
          now.getTime() - 1000 * 60 * 60 * 24 * 12,
        ).toISOString(),
        last_sign_in_at: new Date(
          now.getTime() - 1000 * 60 * 60 * 2,
        ).toISOString(),
        playlist_count: 8,
        track_count: 76,
        is_banned: false,
        status: 'active',
        role: 'user',
      },
      {
        id: 'usr_mock_003',
        email: 'citypop_vibes@naver.com',
        nickname: '시티팝 드라이버',
        avatar_url:
          'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
        provider: 'email',
        created_at: new Date(
          now.getTime() - 1000 * 60 * 60 * 24 * 25,
        ).toISOString(),
        last_sign_in_at: new Date(
          now.getTime() - 1000 * 60 * 60 * 24 * 1,
        ).toISOString(),
        playlist_count: 3,
        track_count: 28,
        is_banned: false,
        status: 'active',
        role: 'user',
      },
      {
        id: 'usr_mock_004',
        email: 'lofi.focus@sofar.app',
        nickname: '집중 로파이',
        avatar_url:
          'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80',
        provider: 'google',
        created_at: new Date(
          now.getTime() - 1000 * 60 * 60 * 24 * 40,
        ).toISOString(),
        last_sign_in_at: new Date(
          now.getTime() - 1000 * 60 * 60 * 5,
        ).toISOString(),
        playlist_count: 12,
        track_count: 110,
        is_banned: false,
        status: 'active',
        role: 'user',
      },
      {
        id: 'usr_mock_005',
        email: 'spammer_alert@baduser.com',
        nickname: '비인가 홍보계정',
        avatar_url: null,
        provider: 'email',
        created_at: new Date(
          now.getTime() - 1000 * 60 * 60 * 24 * 50,
        ).toISOString(),
        last_sign_in_at: new Date(
          now.getTime() - 1000 * 60 * 60 * 24 * 15,
        ).toISOString(),
        playlist_count: 1,
        track_count: 2,
        is_banned: true,
        status: 'banned',
        role: 'user',
      },
    ];
  }

  // ══════════════════════════════════════════════════════════════
  // 검색어 순위 관리 위임 메소드 (Search Ranking Management)
  // ══════════════════════════════════════════════════════════════

  async getSearchRankingData() {
    return this.searchService.getSearchRankingAdminData();
  }

  async pinSearchKeyword(keyword: string, rank?: number) {
    return this.searchService.pinKeyword(keyword, rank);
  }

  async unpinSearchKeyword(keyword: string) {
    return this.searchService.unpinKeyword(keyword);
  }

  async addBlacklistSearchKeyword(keyword: string, reason?: string) {
    return this.searchService.addBlacklistKeyword(keyword, reason);
  }

  async removeBlacklistSearchKeyword(keyword: string) {
    return this.searchService.removeBlacklistKeyword(keyword);
  }

  async addOrUpdateSearchKeyword(keyword: string, count: number) {
    return this.searchService.addOrUpdateKeyword(keyword, count);
  }

  async deleteSearchKeyword(keyword: string) {
    return this.searchService.deleteKeyword(keyword);
  }

  async clearSearchLogs() {
    return this.searchService.clearSearchLogs();
  }

  async recalculateSearchRankings() {
    return this.searchService.recalculateTrending(true);
  }
}

