import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';

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
      if (!res.ok && !(optional && (res.status === 404 || res.status === 400))) {
        const text = await res.text().catch(() => '');
        throw new Error(`${label} delete failed (${res.status}): ${text}`);
      }
    };

    try {
      // 1. 좋아요
      await del('favorites', `/rest/v1/favorites?user_id=eq.${id}`, true);

      // 2. 플레이리스트 하위 트랙 → 플레이리스트
      const plRes = await fetch(
        `${url}/rest/v1/playlists?user_id=eq.${id}&select=id`,
        { headers },
      );
      if (plRes.ok) {
        const pls = (await plRes.json()) as Array<{ id: string }>;
        if (pls.length > 0) {
          const ids = pls.map((p) => `"${p.id}"`).join(',');
          await del('tracks', `/rest/v1/tracks?playlist_id=in.(${encodeURIComponent(ids)})`);
        }
      }
      await del('playlists', `/rest/v1/playlists?user_id=eq.${id}`);

      // 3. 프로필 이미지 (실패해도 계정 삭제는 계속)
      await this.removeAvatars(userId).catch((e) =>
        this.logger.warn(`[Account] avatar cleanup skipped: ${e?.message || e}`),
      );

      // 4. 프로필 → Auth 계정
      await del('profiles', `/rest/v1/profiles?id=eq.${id}`);
      await del('auth user', `/auth/v1/admin/users/${id}`);

      this.logger.log(`[Account] user ${userId} deleted`);
    } catch (error: any) {
      this.logger.error(`[Account] delete error: ${error?.message || error}`);
      throw new InternalServerErrorException('탈퇴 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    }
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
      body: JSON.stringify({ prefixes: files.map((f) => `${userId}/${f.name}`) }),
    });
  }
}
