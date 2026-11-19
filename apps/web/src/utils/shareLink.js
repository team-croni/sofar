import { createPlaylistShareCode } from './playlistSignals';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** 서버(Supabase)에 저장된 플레이리스트만 링크로 공유 가능 (게스트 로컬 플레이리스트 제외) */
export function isShareablePlaylistId(id) {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

export function getPlaylistShareUrl(id, shareCode = null) {
  const base = `${window.location.origin}/p/${id}`;
  return shareCode ? `${base}?s=${encodeURIComponent(shareCode)}` : base;
}

/**
 * 공유 링크를 클립보드에 복사. 성공 여부 반환
 * 링크마다 공유 코드(?s=)를 붙여, 그 링크로 실제 들어온 사람 수를 셀 수 있게 한다.
 * 코드 발급이 실패해도 코드 없는 링크로 복사는 된다.
 */
export async function copyPlaylistShareUrl(id) {
  const shareCode = await createPlaylistShareCode(id);
  const url = getPlaylistShareUrl(id, shareCode);
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
