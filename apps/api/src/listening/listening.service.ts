import { Injectable, Logger } from '@nestjs/common';
import { ChartService } from '../chart/chart.service';
import { ARMS, Arm, ArmStats, hashSeed } from './bandit';
import { supabaseRest } from './supabase-rest';
import {
  ALGO_VERSION,
  CandidatePlaylist,
  CandidateTrack,
  EngineOutput,
  HistoryRow,
  NotInterested,
  PlaylistStats,
  Seed,
  SignalRow,
  SimilarGroup,
  pickSeeds,
  recommend,
  trackKeyOf,
} from './recommend.engine';

export interface PlayEventInput {
  clientId?: string;
  sessionId?: string;
  title?: string;
  artist?: string;
  searchQuery?: string;
  videoId?: string;
  startedAt?: string;
  listenedSec?: number;
  durationSec?: number;
  endReason?: string;
  seekCount?: number;
  sourceType?: string;
  sourceId?: string;
  trigger?: string;
  recAlgo?: string;
  recRequestId?: string;
  tz?: string;
  localHour?: number;
  localDow?: number;
  device?: string;
  locale?: string;
}

export interface RecommendationEventInput {
  clientId?: string;
  requestId?: string;
  algo?: string;
  event?: string;
  items?: Array<{
    itemType?: string;
    itemId?: string;
    position?: number;
    reason?: string;
    arm?: string;
  }>;
}

const ANONYMOUS_AUTHOR = '익명의 리스너';
export interface VerifiedUser {
  id: string;
  createdAt: number;
  emailConfirmed: boolean;
}

const END_REASONS = new Set(['ended', 'switched', 'closed', 'error']);
const SOURCE_TYPES = new Set([
  'my',
  'shared',
  'curated',
  'chart',
  'queue',
  'recommend',
  'search',
  'unknown',
]);
const TRIGGERS = new Set(['search', 'click', 'skip_button', 'auto', 'resume']);
const DEVICES = new Set(['desktop', 'mobile', 'tablet']);
const REC_EVENTS = new Set(['impression', 'click', 'play']);
const ITEM_TYPES = new Set(['track', 'curated', 'shared']);

const str = (v: unknown, max = 300): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};
const int = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n)));
};

@Injectable()
export class ListeningService {
  private readonly logger = new Logger(ListeningService.name);

  // 토큰 → 사용자 ID 캐시 (재생할 때마다 Supabase Auth를 부르지 않도록)
  private readonly tokenCache = new Map<
    string,
    { user: VerifiedUser; at: number }
  >();
  private readonly TOKEN_TTL_MS = 10 * 60 * 1000;

  // 추천 결과 캐시 (같은 사용자가 홈을 오가도 매번 계산하지 않도록)
  private readonly recCache = new Map<
    string,
    { at: number; value: EngineOutput & { requestId: string } }
  >();
  private readonly REC_TTL_MS = 5 * 60 * 1000;

  // 공개 플레이리스트 캐시 (모든 사용자 공통)
  private sharedCache: { at: number; value: CandidatePlaylist[] } | null = null;
  private readonly SHARED_TTL_MS = 5 * 60 * 1000;

  // Last.fm 유사곡 캐시 (곡별 24시간)
  private readonly similarCache = new Map<
    string,
    { at: number; tracks: SimilarGroup['tracks'] }
  >();
  private readonly SIMILAR_TTL_MS = 24 * 3600 * 1000;

  // play_events.trigger 컬럼이 있는지 (SQL을 다시 실행하기 전에도 기록이 끊기지 않도록)
  private triggerColumn: { at: number; exists: boolean } | null = null;

  constructor(private readonly chartService: ChartService) {}

  // recommendation_events.arm 컬럼이 있는지 (supabase_rec_bandit.sql 실행 전에도 기록이 끊기지 않도록)
  private armColumn: { at: number; exists: boolean } | null = null;

  private async hasArmColumn(): Promise<boolean> {
    if (this.armColumn && Date.now() - this.armColumn.at < 10 * 60 * 1000) {
      return this.armColumn.exists;
    }
    const res = await supabaseRest('recommendation_events?select=arm&limit=0');
    this.armColumn = { at: Date.now(), exists: res.ok };
    return res.ok;
  }

  // 팔별 노출·보상 집계 캐시 (모든 사용자 공통, 10분)
  private armStatsCache: {
    at: number;
    value: Partial<Record<Arm, ArmStats>>;
  } | null = null;

  private async loadArmStats(): Promise<Partial<Record<Arm, ArmStats>>> {
    if (
      this.armStatsCache &&
      Date.now() - this.armStatsCache.at < 10 * 60 * 1000
    ) {
      return this.armStatsCache.value;
    }
    const res = await supabaseRest<Array<{ arm: string } & ArmStats>>(
      'rpc/get_rec_arm_stats',
      { method: 'POST', body: JSON.stringify({ window_days: 14 }) },
    );
    const value: Partial<Record<Arm, ArmStats>> = {};
    for (const row of res.data || []) {
      if ((ARMS as readonly string[]).includes(row.arm)) {
        value[row.arm as Arm] = {
          impressions: row.impressions || 0,
          rewards: row.rewards || 0,
        };
      }
    }
    // 집계 함수가 아직 없으면 빈 값(모든 팔 동일한 사전분포)으로 동작한다
    this.armStatsCache = { at: Date.now(), value };
    return value;
  }

  /**
   * A/B: 사용자(또는 브라우저)마다 고정으로 나눠 밴딧 버전을 보여 준다.
   * REC_BANDIT_SHARE(0~100, 기본 50)%가 밴딧, 나머지는 hybrid-v1. 알고리즘 버전은 이벤트에 남아 비교할 수 있다.
   */
  private isBanditViewer(cacheKey: string): boolean {
    const raw = Number(process.env.REC_BANDIT_SHARE ?? 50);
    const share = Number.isFinite(raw) ? Math.min(100, Math.max(0, raw)) : 50;
    return hashSeed(`ab:${cacheKey}`) % 100 < share;
  }

  private async hasTriggerColumn(): Promise<boolean> {
    if (
      this.triggerColumn &&
      Date.now() - this.triggerColumn.at < 10 * 60 * 1000
    ) {
      return this.triggerColumn.exists;
    }
    const { url, key } = this.config();
    if (!url || !key) return false;
    try {
      const res = await fetch(
        `${url}/rest/v1/play_events?select=trigger&limit=0`,
        {
          headers: { apikey: key, Authorization: `Bearer ${key}` },
        },
      );
      this.triggerColumn = { at: Date.now(), exists: res.ok };
    } catch {
      this.triggerColumn = { at: Date.now(), exists: false };
    }
    return this.triggerColumn.exists;
  }

  private async fetchSimilar(seed: Seed): Promise<SimilarGroup['tracks']> {
    const cached = this.similarCache.get(seed.key);
    if (cached && Date.now() - cached.at < this.SIMILAR_TTL_MS) {
      return cached.tracks;
    }
    const apiKey = process.env.LASTFM_API_KEY || '';
    if (!apiKey) return [];
    const params = new URLSearchParams({
      method: 'track.getsimilar',
      artist: seed.artist,
      track: seed.title,
      limit: '30',
      autocorrect: '1',
      format: 'json',
      api_key: apiKey,
    });
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`https://ws.audioscrobbler.com/2.0/?${params}`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) return [];
      const json = (await res.json()) as {
        similartracks?: {
          track?: Array<{
            name?: string;
            match?: number | string;
            duration?: number;
            artist?: { name?: string };
          }>;
        };
      };
      const tracks = (json.similartracks?.track || [])
        .filter((t) => t?.name && t.artist?.name)
        .map((t) => ({
          custom_title: String(t.name),
          custom_artist: String(t.artist?.name),
          searchQuery: `${t.name} ${t.artist?.name}`,
          durationSec: Number(t.duration) || undefined,
          match: Number(t.match) || 0,
        }));
      if (this.similarCache.size > 3000) this.similarCache.clear();
      this.similarCache.set(seed.key, { at: Date.now(), tracks });
      return tracks;
    } catch (e: any) {
      this.logger.warn(
        `[Listening] Last.fm similar failed for "${seed.title}": ${e?.message || e}`,
      );
      return [];
    }
  }

  private async loadSimilar(seeds: Seed[]): Promise<SimilarGroup[]> {
    const groups = await Promise.all(
      seeds.map(async (seed) => ({
        seedKey: seed.key,
        tracks: await this.fetchSimilar(seed),
      })),
    );
    return groups.filter((g) => g.tracks.length > 0);
  }

  private config() {
    return {
      url: process.env.SUPABASE_URL || '',
      key: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    };
  }

  private async rest<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T | null> {
    const { url, key } = this.config();
    if (!url || !key) return null;
    try {
      const res = await fetch(`${url}/rest/v1/${path}`, {
        ...init,
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(init.headers || {}),
        },
      });
      if (!res.ok) {
        this.logger.warn(
          `[Listening] ${path.split('?')[0]} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`,
        );
        return null;
      }
      if (res.status === 201 || res.status === 204) return null;
      return (await res.json()) as T;
    } catch (e: any) {
      this.logger.warn(
        `[Listening] ${path.split('?')[0]} failed: ${e?.message || e}`,
      );
      return null;
    }
  }

  /** Bearer 토큰이 있으면 검증해서 사용자 정보를 돌려준다. 없거나 틀리면 null (익명 처리). */
  async resolveUser(authHeader?: string): Promise<VerifiedUser | null> {
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : '';
    if (!token) return null;
    const cached = this.tokenCache.get(token);
    if (cached && Date.now() - cached.at < this.TOKEN_TTL_MS)
      return cached.user;

    const { url, key } = this.config();
    if (!url || !key) return null;
    try {
      const res = await fetch(`${url}/auth/v1/user`, {
        headers: { apikey: key, Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const raw = (await res.json()) as {
        id?: string;
        created_at?: string;
        email_confirmed_at?: string | null;
        confirmed_at?: string | null;
      };
      if (!raw?.id) return null;
      const user: VerifiedUser = {
        id: raw.id,
        createdAt: Date.parse(raw.created_at || '') || Date.now(),
        emailConfirmed: Boolean(raw.email_confirmed_at || raw.confirmed_at),
      };
      if (this.tokenCache.size > 5000) this.tokenCache.clear();
      this.tokenCache.set(token, { user, at: Date.now() });
      return user;
    } catch {
      return null;
    }
  }

  async resolveUserId(authHeader?: string): Promise<string | null> {
    return (await this.resolveUser(authHeader))?.id ?? null;
  }

  /** 새 감상 기록·피드백이 들어오면 다음 홈 진입 때 추천을 다시 계산하게 한다. */
  invalidateRecommendations(userId: string | null, clientId: string | null) {
    if (userId) this.recCache.delete(this.recCacheKey(userId, null));
    if (clientId) this.recCache.delete(this.recCacheKey(null, clientId));
  }

  async recordPlayEvent(
    body: PlayEventInput,
    userId: string | null,
  ): Promise<boolean> {
    const clientId = str(body.clientId, 100);
    const title = str(body.title);
    const artist = str(body.artist);
    const trackKey = trackKeyOf({
      custom_title: title,
      custom_artist: artist,
      searchQuery: str(body.searchQuery),
    });
    if (!clientId || !trackKey) return false;

    const now = Date.now();
    const durationSec = int(body.durationSec, 0, 6 * 3600);
    // 실제 감상 시간은 곡 길이(+여유)와 경과 시간을 넘을 수 없다
    const startedMs = Date.parse(String(body.startedAt || ''));
    const startedAt =
      Number.isFinite(startedMs) &&
      startedMs <= now &&
      now - startedMs < 12 * 3600 * 1000
        ? new Date(startedMs)
        : new Date(now);
    const elapsedSec = Math.ceil((now - startedAt.getTime()) / 1000) + 5;
    let listenedSec = int(body.listenedSec, 0, 6 * 3600) ?? 0;
    listenedSec = Math.min(listenedSec, elapsedSec);
    if (durationSec) listenedSec = Math.min(listenedSec, durationSec + 30);
    if (listenedSec < 1) return false;

    const completion = durationSec
      ? Math.min(1, listenedSec / durationSec)
      : null;
    const endReason = END_REASONS.has(String(body.endReason))
      ? String(body.endReason)
      : 'switched';
    // 직접 다음 곡으로 넘긴 경우만 스킵으로 본다 (탭 닫기·오류 제외)
    const isSkip =
      endReason === 'switched' &&
      listenedSec < 30 &&
      (completion === null || completion < 0.5);
    const sourceType = SOURCE_TYPES.has(String(body.sourceType))
      ? String(body.sourceType)
      : 'unknown';
    const device = DEVICES.has(String(body.device))
      ? String(body.device)
      : null;

    const row = {
      user_id: userId,
      client_id: clientId,
      session_id: str(body.sessionId, 100),
      track_key: trackKey.slice(0, 500),
      title,
      artist,
      video_id: str(body.videoId, 20),
      started_at: startedAt.toISOString(),
      ended_at: new Date(now).toISOString(),
      listened_sec: listenedSec,
      duration_sec: durationSec,
      completion,
      end_reason: endReason,
      is_skip: isSkip,
      seek_count: int(body.seekCount, 0, 1000) ?? 0,
      source_type: sourceType,
      source_id: str(body.sourceId, 200),
      ...((await this.hasTriggerColumn())
        ? {
            trigger: TRIGGERS.has(String(body.trigger))
              ? String(body.trigger)
              : null,
          }
        : {}),
      rec_algo: str(body.recAlgo, 40),
      rec_request_id: str(body.recRequestId, 80),
      tz: str(body.tz, 64),
      local_hour: int(body.localHour, 0, 23),
      local_dow: int(body.localDow, 0, 6),
      device,
      locale: str(body.locale, 20),
    };

    await this.rest('play_events', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(row),
    });
    // 새 기록이 생겼으니 다음 홈 진입 때 추천을 다시 계산한다
    this.recCache.delete(this.recCacheKey(userId, clientId));
    return true;
  }

  async recordRecommendationEvents(
    body: RecommendationEventInput,
    userId: string | null,
  ): Promise<boolean> {
    const clientId = str(body.clientId, 100);
    const requestId = str(body.requestId, 80);
    const event = String(body.event);
    if (!clientId || !requestId || !REC_EVENTS.has(event)) return false;
    const rows = (Array.isArray(body.items) ? body.items : [])
      .slice(0, 60)
      .filter(
        (it) => ITEM_TYPES.has(String(it?.itemType)) && str(it?.itemId, 500),
      )
      .map((it) => ({
        user_id: userId,
        client_id: clientId,
        request_id: requestId,
        algo: str(body.algo, 40) || ALGO_VERSION,
        event,
        item_type: String(it.itemType),
        item_id: str(it.itemId, 500),
        position: int(it.position, 0, 1000),
        reason: str(it.reason, 200),
      }));
    if (rows.length === 0) return false;
    if (await this.hasArmColumn()) {
      const arms = Array.isArray(body.items) ? body.items : [];
      rows.forEach((row) => {
        const source = arms.find((it) => str(it?.itemId, 500) === row.item_id);
        const arm = String(source?.arm || '');
        (row as Record<string, unknown>).arm = (
          ARMS as readonly string[]
        ).includes(arm)
          ? arm
          : null;
      });
    }
    await this.rest('recommendation_events', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(rows),
    });
    return true;
  }

  private recCacheKey(userId: string | null, clientId: string | null) {
    return userId ? `u:${userId}` : `c:${clientId || 'anon'}`;
  }

  private async loadHistory(
    userId: string | null,
    clientId: string | null,
  ): Promise<HistoryRow[]> {
    const since = new Date(Date.now() - 120 * 24 * 3600 * 1000).toISOString();
    const filter = userId
      ? `user_id=eq.${encodeURIComponent(userId)}`
      : clientId
        ? `client_id=eq.${encodeURIComponent(clientId)}`
        : null;
    if (!filter) return [];
    const triggerField = (await this.hasTriggerColumn()) ? ',trigger' : '';
    const rows = await this.rest<HistoryRow[]>(
      `play_events?${filter}&started_at=gte.${encodeURIComponent(since)}` +
        `&select=track_key,title,artist,listened_sec,completion,is_skip,end_reason${triggerField},started_at` +
        `&order=started_at.desc&limit=1500`,
    );
    return rows || [];
  }

  /** 즐겨찾기와 내 플레이리스트에 담은 곡도 취향 신호로 쓴다. */
  private async loadSignals(userId: string | null): Promise<SignalRow[]> {
    if (!userId) return [];
    const uid = encodeURIComponent(userId);
    const [favorites, ownPlaylists] = await Promise.all([
      this.rest<
        Array<{
          favorited_at?: string;
          tracks?: { custom_title?: string; custom_artist?: string };
        }>
      >(
        `favorites?user_id=eq.${uid}&select=favorited_at,tracks(custom_title,custom_artist)&limit=500`,
      ),
      this.rest<
        Array<{
          tracks?: Array<{
            custom_title?: string;
            custom_artist?: string;
            created_at?: string;
          }>;
        }>
      >(
        `playlists?user_id=eq.${uid}&select=tracks(custom_title,custom_artist,created_at)&limit=50`,
      ),
    ]);
    const signals: SignalRow[] = [];
    for (const f of favorites || []) {
      if (f.tracks) {
        signals.push({
          title: f.tracks.custom_title,
          artist: f.tracks.custom_artist,
          at: f.favorited_at,
          weight: 1.2,
        });
      }
    }
    for (const pl of ownPlaylists || []) {
      for (const t of (pl.tracks || []).slice(0, 300)) {
        signals.push({
          title: t.custom_title,
          artist: t.custom_artist,
          at: t.created_at,
          weight: 0.5,
        });
      }
    }
    return signals;
  }

  /** 사용자가 '관심 없음'으로 표시한 추천 (회원·브라우저 기준 모두) */
  private async loadNotInterested(
    userId: string | null,
    clientId: string | null,
  ): Promise<NotInterested> {
    const keys = [userId && `u:${userId}`, clientId && `c:${clientId}`].filter(
      Boolean,
    ) as string[];
    const empty: NotInterested = { tracks: [], playlists: [], artists: [] };
    if (keys.length === 0) return empty;
    const list = keys.map((k) => `"${k.replace(/"/g, '')}"`).join(',');
    const rows = await this.rest<
      Array<{ item_type: string; item_id: string; artist?: string | null }>
    >(
      `recommendation_feedback?viewer_key=in.(${encodeURIComponent(list)})&select=item_type,item_id,artist&limit=2000`,
    );
    for (const row of rows || []) {
      if (row.item_type === 'track') {
        empty.tracks.push(row.item_id);
        if (row.artist) empty.artists.push(row.artist);
      } else {
        empty.playlists.push(row.item_id);
      }
    }
    return empty;
  }

  // 공개 플레이리스트 반응 집계 캐시 (모든 사용자 공통)
  private statsCache: {
    at: number;
    value: Record<string, PlaylistStats>;
  } | null = null;

  private async loadPlaylistStats(): Promise<Record<string, PlaylistStats>> {
    if (this.statsCache && Date.now() - this.statsCache.at < 10 * 60 * 1000) {
      return this.statsCache.value;
    }
    const rows = await this.rest<
      Array<PlaylistStats & { playlist_id: string }>
    >('rpc/get_playlist_signal_stats', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const value: Record<string, PlaylistStats> = {};
    for (const row of rows || []) value[String(row.playlist_id)] = row;
    if (rows || !this.statsCache) this.statsCache = { at: Date.now(), value };
    return this.statsCache.value;
  }

  private async loadSharedPlaylists(): Promise<CandidatePlaylist[]> {
    if (
      this.sharedCache &&
      Date.now() - this.sharedCache.at < this.SHARED_TTL_MS
    ) {
      return this.sharedCache.value;
    }
    type Row = {
      id: string;
      title?: string;
      author?: string;
      cover_url?: string;
      user_id?: string;
      created_at?: string;
      tracks?: Array<{
        id: string;
        youtube_video_id?: string;
        custom_title?: string;
        custom_artist?: string;
        sequence?: number;
      }>;
    };
    const rows = await this.rest<Row[]>(
      `playlists?is_public=eq.true&select=id,title,author,cover_url,user_id,created_at,` +
        `tracks(id,youtube_video_id,custom_title,custom_artist,sequence)&order=created_at.desc&limit=200`,
    );
    const avatars = await this.loadUploadedAvatars(
      (rows || []).map((pl) => pl.user_id).filter((id): id is string => !!id),
    );
    const value: CandidatePlaylist[] = (rows || [])
      .map((pl) => {
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
          kind: 'shared' as const,
          title: pl.title || '공유 플레이리스트',
          author: pl.author || '공유 리스너',
          // 익명으로 공유한 경우에는 프로필 이미지를 내보내지 않는다
          authorAvatar:
            pl.author === ANONYMOUS_AUTHOR
              ? null
              : avatars.get(pl.user_id || '') || null,
          cover: pl.cover_url || null,
          ownerId: pl.user_id || null,
          createdAt: pl.created_at || null,
          trackCount: tracks.length,
          tracks,
        };
      })
      .filter((pl) => pl.tracks.length > 0);
    // 실패해서 비었을 때는 이전 캐시를 유지한다
    if (value.length > 0 || !this.sharedCache) {
      this.sharedCache = { at: Date.now(), value };
    }
    return this.sharedCache.value;
  }

  /**
   * 사용자가 직접 올린 프로필 이미지만 돌려준다.
   * profiles.avatar_url에는 Google 프로필 사진이 들어 있을 수 있는데, 앱은 직접 올린 이미지만
   * 보여 주므로 Supabase avatars 버킷 주소만 사용한다.
   */
  private async loadUploadedAvatars(
    userIds: string[],
  ): Promise<Map<string, string>> {
    const ids = Array.from(new Set(userIds)).slice(0, 200);
    const map = new Map<string, string>();
    if (ids.length === 0) return map;
    const rows = await this.rest<Array<{ id: string; avatar_url?: string }>>(
      `profiles?id=in.(${ids.map(encodeURIComponent).join(',')})&select=id,avatar_url`,
    );
    for (const row of rows || []) {
      if (
        row.avatar_url &&
        row.avatar_url.includes('/storage/v1/object/public/avatars/')
      ) {
        map.set(row.id, row.avatar_url);
      }
    }
    return map;
  }

  private async loadCuratedPlaylists(): Promise<CandidatePlaylist[]> {
    const [categories, themes] = await Promise.all([
      this.chartService.getCuratedCategoryPlaylists().catch(() => []),
      this.chartService.getCuratedYoutubePlaylists().catch(() => []),
    ]);
    const seen = new Set<string>();
    return [...categories, ...themes]
      .filter(
        (pl) =>
          pl?.tracks?.length > 0 &&
          !seen.has(String(pl.id)) &&
          seen.add(String(pl.id)),
      )
      .map((pl) => ({
        ...pl,
        id: String(pl.id),
        kind: 'curated' as const,
        tracks: pl.tracks as unknown as CandidateTrack[],
      }));
  }

  async getHomeRecommendations(userId: string | null, clientId: string | null) {
    const cacheKey = this.recCacheKey(userId, clientId);
    const cached = this.recCache.get(cacheKey);
    if (cached && Date.now() - cached.at < this.REC_TTL_MS) return cached.value;

    const [
      history,
      signals,
      shared,
      curated,
      popular,
      top,
      notInterested,
      playlistStats,
    ] = await Promise.all([
      this.loadHistory(userId, clientId),
      this.loadSignals(userId),
      this.loadSharedPlaylists(),
      this.loadCuratedPlaylists(),
      this.chartService.getPopularRankings(100).catch(() => []),
      this.chartService.getTopCharts(50).catch(() => []),
      this.loadNotInterested(userId, clientId),
      this.loadPlaylistStats(),
    ]);

    const similar = await this.loadSimilar(
      pickSeeds({ now: Date.now(), history, signals }, 5),
    );

    const day = new Date().toISOString().slice(0, 10);
    const useBandit = this.isBanditViewer(cacheKey);
    const armStats = useBandit ? await this.loadArmStats() : null;

    const output = recommend({
      now: Date.now(),
      seed: `${cacheKey}:${day}`,
      userId,
      history,
      signals,
      playlists: [...curated, ...shared],
      popular: [...popular, ...top] as unknown as CandidateTrack[],
      similar,
      notInterested,
      playlistStats,
      ...(armStats ? { bandit: { stats: armStats } } : {}),
      trackLimit: 24,
      playlistLimit: 12,
    });

    // 카드에 좋아요 수를 보여 주기 위해 공유 플레이리스트에 붙인다 (사람 수 기준 집계)
    const items = output.items.map((item) =>
      item.type === 'playlist' &&
      item.playlistKind === 'shared' &&
      item.playlist
        ? {
            ...item,
            playlist: {
              ...item.playlist,
              likeCount: playlistStats[item.itemId]?.likes ?? 0,
            },
          }
        : item,
    );
    const value = {
      ...output,
      items,
      requestId: `rec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    };
    if (this.recCache.size > 2000) this.recCache.clear();
    this.recCache.set(cacheKey, { at: Date.now(), value });
    return value;
  }
}
