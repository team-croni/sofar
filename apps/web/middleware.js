/**
 * Vercel Routing Middleware — 플레이리스트 공유 링크(/p/:id) 미리보기 카드
 *
 * 카카오톡·디스코드·X 등 링크 미리보기 크롤러는 JavaScript를 실행하지 않으므로,
 * 공개 플레이리스트 링크 요청 시 index.html의 og/twitter 메타 태그를
 * 해당 플레이리스트 정보로 바꿔서 응답한다. 카드 이미지는 /api/og에서 생성한다.
 *
 * 비공개·존재하지 않는 플레이리스트이거나 조회에 실패하면 아무것도 하지 않고
 * 기존 라우팅(vercel.json의 SPA rewrite)으로 넘긴다 → 기본 sofar 카드 노출.
 */

import {
  UUID_REGEX,
  OG_IMAGE_WIDTH,
  OG_IMAGE_HEIGHT,
  fetchPublicPlaylist,
  fetchWithTimeout,
  getAuthorLabel,
  getCardVersion,
} from './server/sharedPlaylist.js';

export const config = {
  matcher: '/p/:path*',
};

const MAX_TRACK_NAMES = 3;

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

function buildMeta(playlist, origin) {
  const pageUrl = `${origin}/p/${playlist.id}`;
  const name = playlist.title || '플레이리스트';
  const author = getAuthorLabel(playlist);
  const count = playlist.tracks.length;

  const title = `${name} · ${count}곡 플레이리스트 | sofar`;

  const trackNames = playlist.tracks
    .slice(0, MAX_TRACK_NAMES)
    .map(t => t.custom_title)
    .filter(Boolean);
  const description = [
    `${author ? `${author}님이` : 'sofar 리스너가'} 공유한 플레이리스트입니다.`,
    trackNames.length > 0
      ? `${trackNames.join(', ')}${count > trackNames.length ? ' 등' : ''} ${count}곡이 담겨 있습니다.`
      : `${count}곡이 담겨 있습니다.`,
    'sofar에서 광고 없이 가사를 보며 들어 보세요.',
  ].join(' ');

  const image = `${origin}/api/og?id=${playlist.id}&v=${getCardVersion(playlist)}`;
  const imageAlt = `${name} · ${count}곡 플레이리스트 | sofar`;

  return [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<link rel="canonical" href="${escapeHtml(pageUrl)}" />`,
    `<meta property="og:type" content="music.playlist" />`,
    `<meta property="og:site_name" content="sofar" />`,
    `<meta property="og:locale" content="ko_KR" />`,
    `<meta property="og:url" content="${escapeHtml(pageUrl)}" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    `<meta property="og:image:type" content="image/png" />`,
    `<meta property="og:image:width" content="${OG_IMAGE_WIDTH}" />`,
    `<meta property="og:image:height" content="${OG_IMAGE_HEIGHT}" />`,
    `<meta property="og:image:alt" content="${escapeHtml(imageAlt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
    `<meta name="twitter:image:alt" content="${escapeHtml(imageAlt)}" />`,
  ].join('\n    ');
}

function injectMeta(html, metaBlock) {
  const stripped = html
    .replace(/<title>[\s\S]*?<\/title>\s*/i, '')
    .replace(/<link\s+rel="canonical"[^>]*>\s*/gi, '')
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

    const html = injectMeta(await indexRes.text(), buildMeta(playlist, url.origin));
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
