import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { ListeningService, VerifiedUser } from './listening.service';
import { RateLimiter, RestResult, supabaseRest } from './supabase-rest';

/** 저장 실패를 성공처럼 보이지 않게 한다 */
function ensureSaved(res: RestResult<unknown>) {
  if (!res.ok) {
    throw new ServiceUnavailableException(
      '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    );
  }
}

/**
 * 플레이리스트 좋아요·응원·조회·공유 유입, 추천 '관심 없음'.
 *
 * 어뷰징 방지
 * - 좋아요·응원은 서버가 검증한 로그인 계정만. 응원은 가입 3일 이상 + 이메일 인증 계정, 주 3회.
 * - 본인 플레이리스트에 대한 반응·조회는 받지 않는다. 비공개 플레이리스트도 받지 않는다.
 * - 조회는 사람당 하루 1회, 공유 유입은 공유 링크당 사람 1회, 공유한 본인 유입은 제외 (DB 기본키로 중복 차단).
 * - IP·계정·브라우저별 요청 수 제한.
 * - 순위·추천에는 원본 횟수가 아니라 DB 집계 함수의 '사람 수'만 쓴다.
 */

const HYPE_WEEKLY_LIMIT = 3;
const HYPE_MIN_ACCOUNT_AGE_MS = 3 * 24 * 3600 * 1000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VIEW_SOURCES = new Set([
  'home',
  'recommend',
  'share_link',
  'search',
  'my_info',
  'unknown',
]);
const FEEDBACK_ITEM_TYPES = new Set(['track', 'curated', 'shared']);

const clean = (v: unknown, max = 200): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};

/** 한국 시간 기준 그 주 월요일 (YYYY-MM-DD) */
export function weekStartKst(now = Date.now()): string {
  const kst = new Date(now + 9 * 3600 * 1000);
  const day = kst.getUTCDay(); // 0=일
  const diff = (day + 6) % 7; // 월요일까지 거슬러 갈 날 수
  kst.setUTCDate(kst.getUTCDate() - diff);
  return kst.toISOString().slice(0, 10);
}

function todayKst(now = Date.now()): string {
  return new Date(now + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

@Injectable()
export class SignalsService {
  // IP 기준 전체 요청 제한(학교·회사처럼 여러 명이 한 IP를 쓰는 경우를 고려해 넉넉히),
  // 계정·브라우저 기준 쓰기 제한(한 사람이 반복해서 누르는 것을 막음)
  private readonly ipLimiter = new RateLimiter(300, 60 * 1000);
  private readonly writeLimiter = new RateLimiter(30, 60 * 1000);

  constructor(private readonly listening: ListeningService) {}

  guardRate(ip: string, actorKey: string | null) {
    if (!this.ipLimiter.allow(`ip:${ip}`)) {
      throw new HttpException(
        '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (actorKey && !this.writeLimiter.allow(actorKey)) {
      throw new HttpException(
        '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private requireUser(user: VerifiedUser | null): VerifiedUser {
    if (!user) throw new UnauthorizedException('로그인이 필요합니다.');
    return user;
  }

  private async loadPublicPlaylist(playlistId: string) {
    if (!UUID_RE.test(playlistId))
      throw new NotFoundException('플레이리스트를 찾을 수 없습니다.');
    const res = await supabaseRest<
      Array<{ id: string; user_id: string | null; is_public: boolean }>
    >(`playlists?id=eq.${playlistId}&select=id,user_id,is_public&limit=1`);
    const pl = res.data?.[0];
    if (!pl || !pl.is_public)
      throw new NotFoundException('플레이리스트를 찾을 수 없습니다.');
    return pl;
  }

  // ── 조회 ──────────────────────────────────────────────

  async getSignals(playlistId: string, user: VerifiedUser | null) {
    const pl = await this.loadPublicPlaylist(playlistId);
    const week = weekStartKst();
    const [stats, liked, hypedThisWeek, myHypes] = await Promise.all([
      supabaseRest<
        Array<{ likes: number; hypes_14d: number; viewers_30d: number }>
      >('rpc/get_playlist_signal_stats', {
        method: 'POST',
        body: JSON.stringify({ playlist_ids: [playlistId] }),
      }),
      user
        ? supabaseRest<unknown[]>(
            `playlist_likes?user_id=eq.${user.id}&playlist_id=eq.${playlistId}&select=playlist_id`,
          )
        : Promise.resolve(null),
      user
        ? supabaseRest<unknown[]>(
            `playlist_hypes?user_id=eq.${user.id}&playlist_id=eq.${playlistId}&week_start=eq.${week}&select=playlist_id`,
          )
        : Promise.resolve(null),
      user
        ? supabaseRest<unknown[]>(
            `playlist_hypes?user_id=eq.${user.id}&week_start=eq.${week}&select=playlist_id`,
          )
        : Promise.resolve(null),
    ]);
    const row = stats.data?.[0];
    const isOwner = Boolean(user && pl.user_id === user.id);
    return {
      likeCount: row?.likes ?? 0,
      hypeCount: row?.hypes_14d ?? 0,
      viewerCount: row?.viewers_30d ?? 0,
      liked: Boolean(liked?.data?.length),
      hypedThisWeek: Boolean(hypedThisWeek?.data?.length),
      hypesLeft: user
        ? Math.max(0, HYPE_WEEKLY_LIMIT - (myHypes?.data?.length ?? 0))
        : 0,
      canHype: Boolean(user && this.hypeEligibility(user) === null),
      isOwner,
    };
  }

  // ── 좋아요 ────────────────────────────────────────────

  async setLike(
    playlistId: string,
    userIn: VerifiedUser | null,
    liked: boolean,
  ) {
    const user = this.requireUser(userIn);
    const pl = await this.loadPublicPlaylist(playlistId);
    if (pl.user_id === user.id)
      throw new ForbiddenException(
        '내 플레이리스트에는 좋아요를 누를 수 없습니다.',
      );
    if (liked) {
      const saved = await supabaseRest(
        'playlist_likes?on_conflict=user_id,playlist_id',
        {
          method: 'POST',
          headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
          body: JSON.stringify({ user_id: user.id, playlist_id: playlistId }),
        },
      );
      ensureSaved(saved);
    } else {
      const removed = await supabaseRest(
        `playlist_likes?user_id=eq.${user.id}&playlist_id=eq.${playlistId}`,
        {
          method: 'DELETE',
          headers: { Prefer: 'return=minimal' },
        },
      );
      ensureSaved(removed);
    }
    return this.getSignals(playlistId, user);
  }

  // ── 응원(hype) ────────────────────────────────────────

  /** 응원할 수 없는 이유 (없으면 null) */
  private hypeEligibility(user: VerifiedUser): string | null {
    if (!user.emailConfirmed)
      return '이메일 인증을 마친 계정만 응원할 수 있습니다.';
    if (Date.now() - user.createdAt < HYPE_MIN_ACCOUNT_AGE_MS) {
      return '가입 후 3일이 지나면 응원할 수 있습니다.';
    }
    return null;
  }

  async hype(playlistId: string, userIn: VerifiedUser | null) {
    const user = this.requireUser(userIn);
    const reason = this.hypeEligibility(user);
    if (reason) throw new ForbiddenException(reason);
    const pl = await this.loadPublicPlaylist(playlistId);
    if (pl.user_id === user.id)
      throw new ForbiddenException('내 플레이리스트는 응원할 수 없습니다.');

    const week = weekStartKst();
    const mine = await supabaseRest<Array<{ playlist_id: string }>>(
      `playlist_hypes?user_id=eq.${user.id}&week_start=eq.${week}&select=playlist_id`,
    );
    const used = mine.data || [];
    if (used.some((h) => h.playlist_id === playlistId)) {
      throw new BadRequestException(
        '이번 주에 이미 응원한 플레이리스트입니다.',
      );
    }
    if (used.length >= HYPE_WEEKLY_LIMIT) {
      throw new BadRequestException(
        `응원은 일주일에 ${HYPE_WEEKLY_LIMIT}번까지 할 수 있습니다.`,
      );
    }
    const saved = await supabaseRest(
      'playlist_hypes?on_conflict=user_id,playlist_id,week_start',
      {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify({
          user_id: user.id,
          playlist_id: playlistId,
          week_start: week,
        }),
      },
    );
    ensureSaved(saved);
    return this.getSignals(playlistId, user);
  }

  // ── 조회 기록 ──────────────────────────────────────────

  async recordView(
    body: { playlistId?: string; clientId?: string; source?: string },
    user: VerifiedUser | null,
  ) {
    const playlistId = clean(body.playlistId, 64);
    const clientId = clean(body.clientId, 100);
    if (!playlistId || !UUID_RE.test(playlistId) || (!user && !clientId))
      return false;
    const pl = await this.loadPublicPlaylist(playlistId).catch(() => null);
    if (!pl || (user && pl.user_id === user.id)) return false;
    const source = VIEW_SOURCES.has(String(body.source))
      ? String(body.source)
      : 'unknown';
    await supabaseRest(
      'playlist_views?on_conflict=viewer_key,playlist_id,day',
      {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify({
          viewer_key: user ? `u:${user.id}` : `c:${clientId}`,
          playlist_id: playlistId,
          day: todayKst(),
          user_id: user?.id ?? null,
          source,
        }),
      },
    );
    return true;
  }

  // ── 공유 ──────────────────────────────────────────────

  async createShare(
    playlistId: string,
    clientIdIn: unknown,
    user: VerifiedUser | null,
  ) {
    const clientId = clean(clientIdIn, 100);
    if (!user && !clientId) throw new BadRequestException('잘못된 요청입니다.');
    await this.loadPublicPlaylist(playlistId);
    const id = randomBytes(6).toString('base64url');
    const res = await supabaseRest('playlist_shares', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        id,
        playlist_id: playlistId,
        sharer_key: user ? `u:${user.id}` : `c:${clientId}`,
        sharer_user_id: user?.id ?? null,
      }),
    });
    if (!res.ok)
      throw new BadRequestException('공유 링크를 만들지 못했습니다.');
    return { shareId: id };
  }

  async recordShareVisit(
    body: { shareId?: string; playlistId?: string; clientId?: string },
    user: VerifiedUser | null,
  ) {
    const shareId = clean(body.shareId, 32);
    const clientId = clean(body.clientId, 100);
    if (!shareId || (!user && !clientId)) return false;
    const share = await supabaseRest<
      Array<{
        playlist_id: string;
        sharer_key: string;
        sharer_user_id: string | null;
      }>
    >(
      `playlist_shares?id=eq.${encodeURIComponent(shareId)}&select=playlist_id,sharer_key,sharer_user_id&limit=1`,
    );
    const row = share.data?.[0];
    if (!row || (body.playlistId && row.playlist_id !== body.playlistId))
      return false;
    const visitorKey = user ? `u:${user.id}` : `c:${clientId}`;
    // 공유한 본인이 자기 링크로 들어온 것은 세지 않는다
    if (
      visitorKey === row.sharer_key ||
      (user && user.id === row.sharer_user_id)
    )
      return false;
    const pl = await this.loadPublicPlaylist(row.playlist_id).catch(() => null);
    if (!pl || (user && pl.user_id === user.id)) return false;
    await supabaseRest(
      'playlist_share_visits?on_conflict=share_id,visitor_key',
      {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify({
          share_id: shareId,
          visitor_key: visitorKey,
          playlist_id: row.playlist_id,
        }),
      },
    );
    return true;
  }

  // ── 추천 '관심 없음' ───────────────────────────────────

  async recordNotInterested(
    body: {
      itemType?: string;
      itemId?: string;
      artist?: string;
      clientId?: string;
    },
    user: VerifiedUser | null,
  ) {
    const itemType = String(body.itemType);
    const itemId = clean(body.itemId, 500);
    const clientId = clean(body.clientId, 100);
    if (!FEEDBACK_ITEM_TYPES.has(itemType) || !itemId || (!user && !clientId)) {
      throw new BadRequestException('잘못된 요청입니다.');
    }
    const saved = await supabaseRest(
      'recommendation_feedback?on_conflict=viewer_key,item_type,item_id',
      {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          viewer_key: user ? `u:${user.id}` : `c:${clientId}`,
          user_id: user?.id ?? null,
          item_type: itemType,
          item_id: itemId,
          artist: itemType === 'track' ? clean(body.artist, 200) : null,
          feedback: 'not_interested',
        }),
      },
    );
    ensureSaved(saved);
    this.listening.invalidateRecommendations(user?.id ?? null, clientId);
    return true;
  }
}
