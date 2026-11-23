import {
  BadRequestException,
  ServiceUnavailableException,
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';

import { RateLimiter, supabaseRest } from '../listening/supabase-rest';
import {
  HANDLE_COOLDOWN_DAYS,
  handleFormatProblem,
  handleMessage,
  normalizeHandle,
} from './handle';

export interface HandleState {
  handle: string | null;
  changedAt: string | null;
  /** 다음에 바꿀 수 있는 시각 (지금 바꿀 수 있으면 null) */
  nextChangeAt: string | null;
}

export function nextHandleChangeAt(
  changedAt: string | null,
  now = Date.now(),
): string | null {
  if (!changedAt) return null;
  const next = Date.parse(changedAt) + HANDLE_COOLDOWN_DAYS * 86_400_000;
  return Number.isFinite(next) && next > now
    ? new Date(next).toISOString()
    : null;
}

export const GENDERS = ['female', 'male', 'other'] as const;
export type Gender = (typeof GENDERS)[number];
export interface Demographics {
  birthYear: number | null;
  gender: Gender | null;
}

/** 만 14세 미만은 법정대리인 동의가 필요하므로 연령 정보를 받지 않는다 */
export const MIN_AGE = 14;
export const MAX_AGE = 100;

/** 만 14세 이상이 확실한 가장 늦은 출생 연도 (2026년이면 2011) */
export function latestBirthYear(now = new Date()) {
  return now.getFullYear() - MIN_AGE - 1;
}

/**
 * 입력값 검사. 빈 값(null·'')은 '선택 안 함'으로 지운다.
 * 연도 범위를 벗어나거나 알 수 없는 성별이면 오류 문구를 돌려준다.
 */
export function parseDemographics(
  body: unknown,
  now = new Date(),
): { value: Demographics } | { error: string } {
  const raw = (body && typeof body === 'object' ? body : {}) as Record<
    string,
    unknown
  >;
  const thisYear = now.getFullYear();
  let birthYear: number | null = null;
  if (
    raw.birthYear !== null &&
    raw.birthYear !== undefined &&
    raw.birthYear !== ''
  ) {
    const y = Number(raw.birthYear);
    if (!Number.isInteger(y))
      return { error: '출생 연도가 올바르지 않습니다.' };
    // 연도만 받으므로 생일이 지나지 않았어도 만 14세 이상이 확실한 해까지만 받는다
    if (y > latestBirthYear(now))
      return { error: `만 ${MIN_AGE}세 이상만 입력할 수 있습니다.` };
    if (y < thisYear - MAX_AGE)
      return { error: '출생 연도가 올바르지 않습니다.' };
    birthYear = y;
  }
  let gender: Gender | null = null;
  if (raw.gender !== null && raw.gender !== undefined && raw.gender !== '') {
    if (!GENDERS.includes(raw.gender as Gender))
      return { error: '성별 값이 올바르지 않습니다.' };
    gender = raw.gender as Gender;
  }
  return { value: { birthYear, gender } };
}

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  private config() {
    const url = process.env.SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const headers = {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    };
    return { url, headers };
  }

  /**
   * 회원 탈퇴: 사용자 소유 데이터 → 프로필 이미지 → 프로필 → Auth 계정 순으로 완전 삭제 (F-AUTH-05)
   * DB의 ON DELETE CASCADE가 없는 환경에서도 남는 데이터가 없도록 하위 데이터부터 지운다.
   */
  async deleteAccount(userId: string): Promise<void> {
    const { url, headers } = this.config();
    const id = encodeURIComponent(userId);

    const del = async (label: string, path: string, optional = false) => {
      const res = await fetch(`${url}${path}`, { method: 'DELETE', headers });
      // 테이블이 없는 환경(404)은 건너뜀
      if (
        !res.ok &&
        !(optional && (res.status === 404 || res.status === 400))
      ) {
        const text = await res.text().catch(() => '');
        throw new Error(`${label} delete failed (${res.status}): ${text}`);
      }
    };

    try {
      // 0. 연령·성별 (auth 계정 삭제 시에도 지워지지만 먼저 직접 지운다)
      await del(
        'profile_demographics',
        `/rest/v1/profile_demographics?user_id=eq.${id}`,
        true,
      );
      // 1. 좋아요, 감상 기록, 추천 노출·클릭 기록
      await del('favorites', `/rest/v1/favorites?user_id=eq.${id}`, true);
      await del('play_events', `/rest/v1/play_events?user_id=eq.${id}`, true);
      await del(
        'recommendation_events',
        `/rest/v1/recommendation_events?user_id=eq.${id}`,
        true,
      );
      // 플레이리스트 반응·조회·공유 유입·관심 없음 (좋아요·응원은 auth 계정 삭제 시 함께 지워진다)
      const viewer = encodeURIComponent(`u:${userId}`);
      await del(
        'recommendation_serves',
        `/rest/v1/recommendation_serves?viewer_key=eq.${viewer}`,
        true,
      );
      await del(
        'playlist_views',
        `/rest/v1/playlist_views?viewer_key=eq.${viewer}`,
        true,
      );
      await del(
        'playlist_share_visits',
        `/rest/v1/playlist_share_visits?visitor_key=eq.${viewer}`,
        true,
      );
      await del(
        'recommendation_feedback',
        `/rest/v1/recommendation_feedback?viewer_key=eq.${viewer}`,
        true,
      );

      // 2. 플레이리스트 하위 트랙 → 플레이리스트
      const plRes = await fetch(
        `${url}/rest/v1/playlists?user_id=eq.${id}&select=id`,
        { headers },
      );
      if (plRes.ok) {
        const pls = (await plRes.json()) as Array<{ id: string }>;
        if (pls.length > 0) {
          const ids = pls.map((p) => `"${p.id}"`).join(',');
          await del(
            'tracks',
            `/rest/v1/tracks?playlist_id=in.(${encodeURIComponent(ids)})`,
          );
        }
      }
      await del('playlists', `/rest/v1/playlists?user_id=eq.${id}`);

      // 3. 프로필 이미지 (실패해도 계정 삭제는 계속)
      await this.removeAvatars(userId).catch((e) =>
        this.logger.warn(
          `[Account] avatar cleanup skipped: ${e?.message || e}`,
        ),
      );

      // 4. 프로필 → Auth 계정
      await del('profiles', `/rest/v1/profiles?id=eq.${id}`);
      await del('auth user', `/auth/v1/admin/users/${id}`);

      this.logger.log(`[Account] user ${userId} deleted`);
    } catch (error: any) {
      this.logger.error(`[Account] delete error: ${error?.message || error}`);
      throw new InternalServerErrorException(
        '탈퇴 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.',
      );
    }
  }

  private readonly handleCheckLimiter = new RateLimiter(60, 60_000);
  private readonly handleChangeLimiter = new RateLimiter(10, 60_000);

  /** 내 핸들 (없으면 만들어 준다) */
  async getHandle(userId: string): Promise<HandleState> {
    const res = await supabaseRest<{
      handle: string | null;
      changedAt: string | null;
    }>('rpc/ensure_handle', {
      method: 'POST',
      body: JSON.stringify({ p_user: userId }),
    });
    if (!res.ok || !res.data) {
      throw new ServiceUnavailableException(
        '핸들 기능이 아직 준비되지 않았습니다 (supabase_profile_handles.sql 실행 필요).',
      );
    }
    return {
      handle: res.data.handle,
      changedAt: res.data.changedAt,
      nextChangeAt: nextHandleChangeAt(res.data.changedAt),
    };
  }

  /** 입력하는 동안 쓸 수 있는지 확인 */
  async checkHandle(
    userId: string,
    input: unknown,
  ): Promise<{ handle: string; available: boolean; message: string | null }> {
    if (!this.handleCheckLimiter.allow(userId)) {
      throw new BadRequestException('잠시 후 다시 시도해 주세요.');
    }
    const handle = normalizeHandle(input);
    const formatProblem = handleFormatProblem(handle);
    if (formatProblem) {
      return {
        handle,
        available: false,
        message: handleMessage(formatProblem),
      };
    }
    const res = await supabaseRest<string | null>(
      'rpc/handle_unavailable_reason',
      {
        method: 'POST',
        body: JSON.stringify({ p_handle: handle, p_user: userId }),
      },
    );
    if (!res.ok) {
      throw new ServiceUnavailableException('잠시 후 다시 시도해 주세요.');
    }
    const reason = res.data;
    return {
      handle,
      available: !reason,
      message: reason ? handleMessage(reason) : null,
    };
  }

  /** 핸들 바꾸기 (30일에 한 번) */
  async changeHandle(userId: string, input: unknown): Promise<HandleState> {
    if (!this.handleChangeLimiter.allow(userId)) {
      throw new BadRequestException('잠시 후 다시 시도해 주세요.');
    }
    const handle = normalizeHandle(input);
    const formatProblem = handleFormatProblem(handle);
    if (formatProblem)
      throw new BadRequestException(handleMessage(formatProblem));

    const res = await supabaseRest<{
      ok: boolean;
      reason?: string;
      handle?: string;
      changedAt?: string | null;
      nextChangeAt?: string;
    }>('rpc/change_handle', {
      method: 'POST',
      body: JSON.stringify({ p_user: userId, p_handle: handle }),
    });
    if (!res.ok || !res.data) {
      throw new ServiceUnavailableException('잠시 후 다시 시도해 주세요.');
    }
    if (!res.data.ok) {
      const message =
        res.data.reason === 'cooldown' && res.data.nextChangeAt
          ? `${handleMessage('cooldown')} ${new Date(res.data.nextChangeAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}부터 바꿀 수 있습니다.`
          : handleMessage(res.data.reason);
      throw new BadRequestException(message);
    }
    const changedAt = res.data.changedAt ?? null;
    return {
      handle: res.data.handle ?? handle,
      changedAt,
      nextChangeAt: nextHandleChangeAt(changedAt),
    };
  }

  /** 본인의 연령·성별. 테이블이 없으면(아직 SQL 미실행) available: false */
  async getDemographics(
    userId: string,
  ): Promise<Demographics & { available: boolean }> {
    const { url, headers } = this.config();
    const res = await fetch(
      `${url}/rest/v1/profile_demographics?user_id=eq.${encodeURIComponent(userId)}&select=birth_year,gender`,
      { headers },
    );
    if (!res.ok) return { birthYear: null, gender: null, available: false };
    const rows = (await res.json()) as Array<{
      birth_year: number | null;
      gender: Gender | null;
    }>;
    return {
      birthYear: rows[0]?.birth_year ?? null,
      gender: rows[0]?.gender ?? null,
      available: true,
    };
  }

  /** 둘 다 비우면 행을 지운다 (선택 정보를 남겨 두지 않음) */
  async saveDemographics(userId: string, body: unknown): Promise<Demographics> {
    const parsed = parseDemographics(body);
    if ('error' in parsed) throw new BadRequestException(parsed.error);
    const { birthYear, gender } = parsed.value;
    const { url, headers } = this.config();
    const id = encodeURIComponent(userId);
    const res =
      birthYear === null && gender === null
        ? await fetch(`${url}/rest/v1/profile_demographics?user_id=eq.${id}`, {
            method: 'DELETE',
            headers,
          })
        : await fetch(
            `${url}/rest/v1/profile_demographics?on_conflict=user_id`,
            {
              method: 'POST',
              headers: {
                ...headers,
                Prefer: 'resolution=merge-duplicates,return=minimal',
              },
              body: JSON.stringify({
                user_id: userId,
                birth_year: birthYear,
                gender,
                updated_at: new Date().toISOString(),
              }),
            },
          );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(
        `[Account] demographics save failed (${res.status}): ${text}`,
      );
      throw new InternalServerErrorException(
        '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      );
    }
    return { birthYear, gender };
  }

  private async removeAvatars(userId: string) {
    const { url, headers } = this.config();
    const listRes = await fetch(`${url}/storage/v1/object/list/avatars`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ prefix: userId, limit: 100 }),
    });
    if (!listRes.ok) return;
    const files = (await listRes.json()) as Array<{ name: string }>;
    if (!Array.isArray(files) || files.length === 0) return;
    await fetch(`${url}/storage/v1/object/avatars`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({
        prefixes: files.map((f) => `${userId}/${f.name}`),
      }),
    });
  }
}
