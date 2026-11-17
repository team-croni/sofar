/**
 * 공유 플레이리스트 미리보기(middleware.js, api/og.js) 공용 헬퍼.
 * Vercel 서버 측(Edge)에서만 사용한다.
 */

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

const FETCH_TIMEOUT_MS = 2500;

export async function fetchWithTimeout(resource, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(resource, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** 공개(is_public) 플레이리스트만 조회. 없거나 비공개면 null */
export async function fetchPublicPlaylist(playlistId) {
  if (!playlistId || !UUID_REGEX.test(playlistId)) return null;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return null;

  const params = new URLSearchParams({
    id: `eq.${playlistId}`,
    is_public: 'eq.true',
    select: 'id,title,author,cover_url,tracks(youtube_video_id,custom_title,custom_artist,sequence,created_at)',
  });
  const res = await fetchWithTimeout(`${supabaseUrl}/rest/v1/playlists?${params}`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const playlist = rows[0];
  const tracks = [...(playlist.tracks || [])]
    .sort((a, b) =>
      (a.sequence || 0) - (b.sequence || 0)
      || String(a.created_at || '').localeCompare(String(b.created_at || ''))
    )
    .map(t => ({
      ...t,
      custom_title: decodeEntities(t.custom_title),
      custom_artist: decodeEntities(t.custom_artist),
    }));
  return {
    ...playlist,
    title: decodeEntities(playlist.title),
    author: decodeEntities(playlist.author),
    tracks,
  };
}

/** 유튜브 제목 등에서 그대로 저장된 HTML 엔티티(&amp; 등) 복원 */
function decodeEntities(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

export function getCoverUrl(playlist) {
  return typeof playlist?.cover_url === 'string' && /^https?:\/\//i.test(playlist.cover_url)
    ? playlist.cover_url
    : null;
}

/** 커버가 없을 때 2x2 그리드에 쓸 유튜브 썸네일 (16:9, 레터박스 없는 mqdefault) */
export function getGridThumbnails(playlist, count = 4) {
  return (playlist?.tracks || [])
    .filter(t => t.youtube_video_id)
    .slice(0, count)
    .map(t => `https://i.ytimg.com/vi/${t.youtube_video_id}/mqdefault.jpg`);
}

export function getAuthorLabel(playlist) {
  const author = typeof playlist?.author === 'string' ? playlist.author.trim() : '';
  return author || null;
}

/** 카드 내용이 바뀌면 이미지 URL도 바뀌도록 하는 짧은 해시 (카카오톡 등 이미지 캐시 무효화) */
export function getCardVersion(playlist) {
  const source = [
    playlist.title,
    playlist.author,
    playlist.cover_url,
    playlist.tracks.length,
    ...playlist.tracks.slice(0, 4).map(t => `${t.youtube_video_id}:${t.custom_title}`),
  ].join('|');
  let hash = 5381;
  for (let i = 0; i < source.length; i++) {
    hash = ((hash << 5) + hash + source.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}
