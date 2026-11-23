import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { supabaseRest } from '../listening/supabase-rest';
import { uploadedAvatarUrl } from '../account/avatar-storage';
import { handleFormatProblem, normalizeHandle } from '../account/handle';

const ANONYMOUS_AUTHOR = '익명의 리스너';
const CACHE_TTL_MS = 60_000;

export interface ChannelPlaylist {
  id: string;
  title: string;
  author: string;
  cover: string | null;
  createdAt: string | null;
  trackCount: number;
  likeCount: number;
  tracks: Array<{
    id: string;
    youtube_video_id?: string;
    custom_title?: string;
    custom_artist?: string;
    searchQuery: string;
  }>;
}

export interface Channel {
  handle: string;
  nickname: string;
  avatarUrl: string | null;
  joinedAt: string | null;
  stats: { playlists: number; tracks: number; likes: number };
  playlists: ChannelPlaylist[];
}

type ProfileRow = {
  id: string;
  username?: string | null;
  handle: string;
  avatar_url?: string | null;
  preferences?: { showNicknameOnShared?: boolean } | null;
  created_at?: string | null;
};

type PlaylistRow = {
  id: string;
  title?: string;
  author?: string | null;
  cover_url?: string | null;
  created_at?: string | null;
  tracks?: Array<{
    id: string;
    youtube_video_id?: string;
    custom_title?: string;
    custom_artist?: string;
    sequence?: number;
  }>;
};

/**
 * 채널(공개 프로필) = sofar.app/@handle
 * 공개해도 되는 것만 내보낸다: 닉네임, 핸들, 직접 올린 프로필 이미지, 가입 시기,
 * 공개 플레이리스트(익명으로 공유한 것은 제외)와 받은 좋아요 수.
 * 이메일·연령·성별·감상 기록은 내보내지 않는다.
 */
@Injectable()
export class ChannelService {
  private readonly logger = new Logger(ChannelService.name);
  private readonly cache = new Map<string, { at: number; value: Channel }>();

  async getChannel(input: string): Promise<Channel> {
    const handle = normalizeHandle(input);
    if (handleFormatProblem(handle)) throw this.notFound();

    const cached = this.cache.get(handle);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

    const profileRes = await supabaseRest<ProfileRow[]>(
      `profiles?handle=eq.${encodeURIComponent(handle)}&select=id,username,handle,avatar_url,preferences,created_at&limit=1`,
    );
    const profile = profileRes.data?.[0];
    if (!profile) throw this.notFound();
    if (await this.isBanned(profile.id)) throw this.notFound();

    // '공유 플레이리스트에 닉네임 표시'를 끈 사람의 플레이리스트는 채널에 묶어 보여 주지 않는다
    const showOnChannel = profile.preferences?.showNicknameOnShared !== false;
    const playlistRows = showOnChannel
      ? ((
          await supabaseRest<PlaylistRow[]>(
            `playlists?user_id=eq.${encodeURIComponent(profile.id)}&is_public=eq.true` +
              `&select=id,title,author,cover_url,created_at,tracks(id,youtube_video_id,custom_title,custom_artist,sequence)` +
              `&order=created_at.desc&limit=100`,
          )
        ).data ?? [])
      : [];

    const visible = playlistRows.filter(
      (pl) => pl.author !== ANONYMOUS_AUTHOR && (pl.tracks?.length ?? 0) > 0,
    );
    const likeCounts = await this.loadLikeCounts(visible.map((pl) => pl.id));
    const nickname = profile.username || '리스너';

    const playlists: ChannelPlaylist[] = visible.map((pl) => {
      const tracks = (pl.tracks || [])
        .slice()
        .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
        .map((t) => ({
          id: t.id,
          youtube_video_id: t.youtube_video_id,
          custom_title: t.custom_title,
          custom_artist: t.custom_artist,
          searchQuery:
            `${t.custom_title || ''} ${t.custom_artist || ''}`.trim(),
        }));
      return {
        id: String(pl.id),
        title: pl.title || '플레이리스트',
        author: nickname,
        cover: pl.cover_url || null,
        createdAt: pl.created_at || null,
        trackCount: tracks.length,
        likeCount: likeCounts.get(String(pl.id)) ?? 0,
        tracks,
      };
    });

    const value: Channel = {
      handle: profile.handle,
      nickname,
      avatarUrl: uploadedAvatarUrl(profile.avatar_url),
      joinedAt: profile.created_at || null,
      stats: {
        playlists: playlists.length,
        tracks: playlists.reduce((sum, pl) => sum + pl.trackCount, 0),
        likes: playlists.reduce((sum, pl) => sum + pl.likeCount, 0),
      },
      playlists,
    };
    if (this.cache.size > 2000) this.cache.clear();
    this.cache.set(handle, { at: Date.now(), value });
    return value;
  }

  private notFound() {
    return new NotFoundException('채널을 찾을 수 없습니다.');
  }

  /** 정지된 계정의 채널은 없는 것처럼 다룬다 */
  private async isBanned(userId: string): Promise<boolean> {
    const url = process.env.SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    try {
      const res = await fetch(
        `${url}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } },
      );
      if (!res.ok) return false;
      const user = (await res.json()) as {
        banned_until?: string | null;
        user_metadata?: { is_banned?: boolean };
      };
      const bannedUntil = user.banned_until
        ? Date.parse(user.banned_until)
        : NaN;
      return (
        Boolean(user.user_metadata?.is_banned) ||
        (Number.isFinite(bannedUntil) && bannedUntil > Date.now())
      );
    } catch (e: any) {
      this.logger.warn(`[Channel] ban check skipped: ${e?.message || e}`);
      return false;
    }
  }

  /** 받은 좋아요 수 (좋아요 집계와 같은 기준: get_playlist_signal_stats) */
  private async loadLikeCounts(ids: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (ids.length === 0) return map;
    const res = await supabaseRest<
      Array<{ playlist_id: string; likes: number }>
    >('rpc/get_playlist_signal_stats', {
      method: 'POST',
      body: JSON.stringify({ playlist_ids: ids }),
    });
    for (const row of res.data || [])
      map.set(String(row.playlist_id), row.likes ?? 0);
    return map;
  }
}
