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

// 보이지 않는 문자(제어 문자, 제로폭 공백, 방향 표시 등) — DB normalize_display_name과 같은 범위
// eslint-disable-next-line no-control-regex
const INVISIBLE_CHARS = /[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;

/** 보이지 않는 문자를 지우고 공백을 하나로 줄인다 (DB 트리거도 같은 정리를 한다) */
export function normalizeNickname(value) {
  return (value || '').replace(INVISIBLE_CHARS, '').replace(/\s+/g, ' ').trim();
}

// 운영자로 보일 수 있는 이름 (DB display_name_problem과 같은 기준)
const IMPERSONATION = /(sofar|croni)/i;
const IMPERSONATION_KO = /(관리자|운영자|운영팀|소파공식)/;
const IMPERSONATION_EXACT = new Set(['admin', 'administrator', 'official', 'moderator', 'staff']);

// 흔한 욕설 (공백·특수문자를 빼고 비교). 서버는 사칭만 막고, 욕설은 입력 단계에서 안내한다
const PROFANITY = ['시발', '씨발', 'ㅅㅂ', '병신', 'ㅂㅅ', '좆', '개새끼', 'fuck', 'shit', 'bitch'];

export function validateNickname(value) {
  const name = normalizeNickname(value);
  if ([...name].length < NICKNAME_MIN) return `닉네임은 ${NICKNAME_MIN}자 이상이어야 합니다.`;
  if ([...name].length > NICKNAME_MAX) return `닉네임은 ${NICKNAME_MAX}자까지 입력할 수 있습니다.`;
  const compact = name.replace(/\s/g, '');
  const loose = compact.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  if (IMPERSONATION.test(compact) || IMPERSONATION_KO.test(compact) || IMPERSONATION_EXACT.has(compact.toLowerCase())) {
    return '운영자로 오해할 수 있는 닉네임은 사용할 수 없습니다.';
  }
  if (PROFANITY.some((w) => loose.includes(w))) return '사용할 수 없는 단어가 포함되어 있습니다.';
  return null;
}

/** DB가 거절한 이유(display_name:reserved 등)를 안내 문구로 */
export function nicknameErrorMessage(error) {
  const msg = String(error?.message || '');
  if (msg.includes('display_name:reserved')) return '운영자로 오해할 수 있는 닉네임은 사용할 수 없습니다.';
  if (msg.includes('display_name:too_short')) return `닉네임은 ${NICKNAME_MIN}자 이상이어야 합니다.`;
  if (msg.includes('display_name:too_long')) return `닉네임은 ${NICKNAME_MAX}자까지 입력할 수 있습니다.`;
  return '닉네임을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

/* ── 핸들(@아이디) ───────────────────────────── */
export const HANDLE_MIN = 3;
export const HANDLE_MAX = 20;
export const HANDLE_COOLDOWN_DAYS = 30;

export function normalizeHandle(value) {
  return (value || '').trim().replace(/^@+/, '').toLowerCase();
}

/** 형식만 바로 검사한다. 예약어·중복은 서버 확인(/api/me/handle/check) 결과를 쓴다 */
export function validateHandleFormat(handle) {
  if (handle.length < HANDLE_MIN) return `핸들은 ${HANDLE_MIN}자 이상이어야 합니다.`;
  if (handle.length > HANDLE_MAX) return `핸들은 ${HANDLE_MAX}자까지 쓸 수 있습니다.`;
  if (!/^[a-z0-9._]+$/.test(handle)) return '영문 소문자, 숫자, 밑줄(_), 마침표(.)만 쓸 수 있습니다.';
  if (/^\.|\.$|\.\./.test(handle)) return '마침표는 처음과 끝에 쓸 수 없고, 연달아 쓸 수 없습니다.';
  if (!/[a-z]/.test(handle)) return '영문자를 하나 이상 넣어 주세요.';
  return null;
}
