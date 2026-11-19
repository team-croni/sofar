/**
 * 사용자 표시 정보 단일 소스
 * - 닉네임: 사용자가 직접 바꾼 display_name이 최우선
 *   (Google 로그인 시 full_name은 매번 구글 값으로 다시 덮어써지므로 별도 키 사용)
 * - 아바타: 직접 올린 이미지(custom_avatar_url)가 있을 때만 사용, 없으면 그라디언트 기본 아바타
 */
export function getUserDisplayName(user, fallback = 'Guest') {
  const meta = user?.user_metadata || {};
  return meta.display_name
    || meta.full_name
    || meta.name
    || user?.email?.split('@')[0]
    || fallback;
}

export function getUserAvatarUrl(user) {
  const meta = user?.user_metadata || {};
  return meta.custom_avatar_url || meta.uploaded_avatar_url || user?.custom_avatar_url || null;
}

/** 'google' | 'email' | null */
export function getUserProvider(user) {
  if (!user || user.isGuest) return null;
  const provider = user.app_metadata?.provider
    || user.identities?.[0]?.provider
    || 'email';
  return provider === 'google' ? 'google' : 'email';
}

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 20;

export function validateNickname(value) {
  const name = (value || '').trim();
  if (name.length < NICKNAME_MIN) return `닉네임은 ${NICKNAME_MIN}자 이상이어야 합니다.`;
  if (name.length > NICKNAME_MAX) return `닉네임은 ${NICKNAME_MAX}자까지 입력할 수 있습니다.`;
  return null;
}
