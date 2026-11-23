/**
 * '방금 전', '5분 전', '3시간 전', '2일 전', '3주 전', '4개월 전', '1년 전'
 * (유튜브 채널 목록처럼 대략적인 시점만 보여 준다)
 */
export function relativeTime(iso, now = Date.now()) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return null;
  const sec = Math.max(0, Math.floor((now - t) / 1000));
  if (sec < 60) return '방금 전';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  const day = Math.floor(hour / 24);
  if (day < 7) return `${day}일 전`;
  if (day < 30) return `${Math.floor(day / 7)}주 전`;
  if (day < 365) return `${Math.floor(day / 30)}개월 전`;
  return `${Math.floor(day / 365)}년 전`;
}

/** 마우스를 올렸을 때 보여 줄 정확한 날짜 */
export function fullDate(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  return new Date(t).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
}
