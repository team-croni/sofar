/**
 * 핸들(@아이디) 규칙의 API 쪽 사본. 최종 판단은 DB 함수(handle_problem, handle_unavailable_reason)가 한다.
 * 여기서는 입력을 정리하고, DB가 돌려준 이유 코드를 안내 문구로 바꾼다.
 */
export const HANDLE_MIN = 3;
export const HANDLE_MAX = 20;
export const HANDLE_COOLDOWN_DAYS = 30;

/** '@Night.Owl ' → 'night.owl' */
export function normalizeHandle(input: unknown): string {
  return String(input ?? '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase();
}

/** 형식만 빠르게 검사 (예약어·중복은 DB에서) */
export function handleFormatProblem(handle: string): string | null {
  if (handle.length < HANDLE_MIN) return 'too_short';
  if (handle.length > HANDLE_MAX) return 'too_long';
  if (!/^[a-z0-9._]+$/.test(handle)) return 'invalid_chars';
  if (/^\.|\.$|\.\./.test(handle)) return 'dot_position';
  if (!/[a-z]/.test(handle)) return 'no_letter';
  return null;
}

const MESSAGES: Record<string, string> = {
  too_short: `핸들은 ${HANDLE_MIN}자 이상이어야 합니다.`,
  too_long: `핸들은 ${HANDLE_MAX}자까지 쓸 수 있습니다.`,
  invalid_chars: '영문 소문자, 숫자, 밑줄(_), 마침표(.)만 쓸 수 있습니다.',
  dot_position: '마침표는 처음과 끝에 쓸 수 없고, 연달아 쓸 수 없습니다.',
  no_letter: '영문자를 하나 이상 넣어 주세요.',
  reserved: '사용할 수 없는 핸들입니다.',
  taken: '이미 사용 중인 핸들입니다.',
  recently_used: '최근에 다른 사람이 쓰던 핸들이라 지금은 사용할 수 없습니다.',
  cooldown: `핸들은 ${HANDLE_COOLDOWN_DAYS}일에 한 번만 바꿀 수 있습니다.`,
  no_profile: '프로필을 찾을 수 없습니다. 다시 로그인해 주세요.',
};

export function handleMessage(reason: string | null | undefined): string {
  return (reason && MESSAGES[reason]) || '사용할 수 없는 핸들입니다.';
}
