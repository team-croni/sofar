const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** 서버(Supabase)에 저장된 플레이리스트만 링크로 공유 가능 (게스트 로컬 플레이리스트 제외) */
export function isShareablePlaylistId(id) {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

export function getPlaylistShareUrl(id) {
  return `${window.location.origin}/p/${id}`;
}

/** 공유 링크를 클립보드에 복사. 성공 여부 반환 */
export async function copyPlaylistShareUrl(id) {
  const url = getPlaylistShareUrl(id);
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return true;
    }
  } catch {
    // 권한 거부 등은 아래 fallback 시도
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = url;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
