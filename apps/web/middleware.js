/**
 * Vercel Routing Middleware — 플레이리스트 공유 링크(/p/:id) 미리보기 카드
 *
 * 카카오톡·디스코드·X 등 링크 미리보기 크롤러는 JavaScript를 실행하지 않으므로,
 * 공개 플레이리스트 링크 요청 시 index.html의 og/twitter 메타 태그를
 * 해당 플레이리스트 정보(제목, 작성자, 곡 수, 커버)로 바꿔서 응답한다.
 *
 * 비공개·존재하지 않는 플레이리스트이거나 조회에 실패하면 아무것도 하지 않고
 * 기존 라우팅(vercel.json의 SPA rewrite)으로 넘긴다 → 기본 sofar 카드 노출.
 */

export const config = {
  matcher: '/p/:path*',
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FETCH_TIMEOUT_MS = 2500;
const MAX_TRACK_NAMES = 3;

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

async function fetchWithTimeout(resource, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(resource, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPublicPlaylist(playlistId) {
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
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

function buildMeta(playlist, pageUrl) {
  const tracks = [...(playlist.tracks || [])].sort((a, b) =>
    (a.sequence || 0) - (b.sequence || 0)
    || String(a.created_at || '').localeCompare(String(b.created_at || ''))
  );

  const title = `${playlist.title || '플레이리스트'} · sofar`;

  const trackNames = tracks
    .slice(0, MAX_TRACK_NAMES)
    .map(t => [t.custom_title, t.custom_artist].filter(Boolean).join(' - '))
    .filter(Boolean);
  const descParts = [
    `${playlist.author || '공유 리스너'}의 플레이리스트 · ${tracks.length}곡`,
  ];
  if (trackNames.length > 0) {
    descParts.push(trackNames.join(', ') + (tracks.length > trackNames.length ? ' 외' : ''));
  }
  const description = descParts.join(' — ');

  const coverUrl = typeof playlist.cover_url === 'string' && /^https?:\/\//i.test(playlist.cover_url)
    ? playlist.cover_url
    : null;
  const firstVideoId = tracks.find(t => t.youtube_video_id)?.youtube_video_id;
  const image = coverUrl || (firstVideoId ? `https://i.ytimg.com/vi/${firstVideoId}/hqdefault.jpg` : null);

  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<meta property="og:type" content="music.playlist" />`,
    `<meta property="og:site_name" content="sofar" />`,
    `<meta property="og:url" content="${escapeHtml(pageUrl)}" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
  ];
  if (image) {
    tags.push(
      `<meta property="og:image" content="${escapeHtml(image)}" />`,
      `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
    );
  }
  return tags.join('\n    ');
}

function injectMeta(html, metaBlock) {
  const stripped = html
    .replace(/<title>[\s\S]*?<\/title>\s*/i, '')
    .replace(/<meta\s+(?:property|name)="(?:og:[^"]*|twitter:[^"]*|description)"[^>]*>\s*/gi, '');
  return stripped.replace(/<\/head>/i, `    ${metaBlock}\n  </head>`);
}

export default async function middleware(request) {
  try {
    const url = new URL(request.url);
    const playlistId = url.pathname.split('/')[2];
    if (!playlistId || !UUID_REGEX.test(playlistId)) return;

    const [playlist, indexRes] = await Promise.all([
      fetchPublicPlaylist(playlistId),
      fetchWithTimeout(new URL('/index.html', url)),
    ]);
    if (!playlist || !indexRes.ok) return;

    const html = injectMeta(await indexRes.text(), buildMeta(playlist, `${url.origin}/p/${playlistId}`));
    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // 제목·커버 수정이 너무 늦게 반영되지 않도록 짧게 캐시
        'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch {
    // 조회 실패 시 기본 SPA 응답으로 진행
    return;
  }
}
