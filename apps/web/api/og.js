/**
 * 링크 미리보기 카드 이미지 (1200x630, 1.91:1)
 *
 * GET /api/og?id=<playlistId>&v=<version>
 *  - 공개 플레이리스트: 커버(또는 곡 썸네일 2x2) + 제목 + 작성자/곡 수 + 앞 3곡 + sofar 브랜딩/CTA
 *  - id 없음 / 비공개 / 조회 실패: sofar 기본 브랜드 카드
 */
import { ImageResponse } from '@vercel/og';
import {
  OG_IMAGE_WIDTH,
  OG_IMAGE_HEIGHT,
  fetchPublicPlaylist,
  fetchWithTimeout,
  getCoverUrl,
  getGridThumbnails,
  getAuthorLabel,
} from '../server/sharedPlaylist.js';

export const config = { runtime: 'edge' };

const COLORS = {
  bg: '#121212',
  bgWarm: '#211a14',
  warm: '#D4A373',
  text: '#F5F2EE',
  sub: '#A8A29E',
  dim: '#78716C',
  card: '#1E1E1E',
};

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 64" fill="none"><path d="M23.6902 27.1724C30.9866 34.4689 20.8527 3.58695 47.2753 30.0098C73.698 56.4327 51.7343 13.7209 44.4379 6.4244C37.1415 -0.872077 26.5821 -2.14244 20.8527 3.58695C15.1234 9.31635 16.3938 19.8759 23.6902 27.1724Z" fill="#D4A373"/><path d="M36.2525 32.827C28.9561 25.5306 39.09 56.4125 12.6674 29.9896C-13.7553 3.5667 8.20837 46.2785 15.5048 53.575C22.8012 60.8715 33.3606 62.1419 39.09 56.4125C44.8193 50.6831 43.5489 40.1235 36.2525 32.827Z" fill="#D4A373"/></svg>`;
const LOGO_DATA_URI = `data:image/svg+xml;base64,${btoa(LOGO_SVG)}`;
const PLAY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" fill="#121212"/></svg>`;
const PLAY_DATA_URI = `data:image/svg+xml;base64,${btoa(PLAY_SVG)}`;

const TAGLINE = '유튜브 음악을 실시간 가사와 함께';
const CTA_TEXT = 'sofar에서 무료로 듣기';

// satori는 JSX 없이 { type, props } 트리를 그대로 받는다
const h = (type, style, ...children) => ({
  type,
  props: { style, children: children.length === 1 ? children[0] : children },
});
const img = (src, style) => ({ type: 'img', props: { src, style } });

const truncate = (text, max) => {
  const chars = Array.from(String(text || ''));
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : chars.join('');
};

/** Google Fonts에서 필요한 글자만 서브셋으로 받아오기 (satori는 woff2 미지원 → ttf/otf) */
async function loadGoogleFont(family, weight, text) {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&text=${encodeURIComponent(text)}`;
  const css = await (await fetchWithTimeout(cssUrl)).text();
  const match = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/);
  if (!match) throw new Error(`font not found: ${family} ${weight}`);
  return (await fetchWithTimeout(match[1])).arrayBuffer();
}

function logoRow(iconSize, fontSize) {
  return h('div', { display: 'flex', alignItems: 'center', gap: Math.round(iconSize * 0.3) },
    img(LOGO_DATA_URI, { width: iconSize, height: iconSize }),
    h('div', { display: 'flex', fontFamily: 'Outfit', fontSize, letterSpacing: '0.02em', lineHeight: 1 },
      h('span', { color: COLORS.text, fontWeight: 300 }, 'so'),
      h('span', { color: COLORS.warm, fontWeight: 400 }, 'far'),
    ),
  );
}

function ctaPill() {
  return h('div', {
    display: 'flex', alignItems: 'center', gap: 12,
    background: COLORS.warm, color: COLORS.bg,
    borderRadius: 999, padding: '16px 30px 16px 24px',
    fontSize: 26, fontWeight: 700,
  },
    img(PLAY_DATA_URI, { width: 24, height: 24 }),
    CTA_TEXT,
  );
}

function coverArt(playlist, size) {
  const radius = 36;
  const cover = getCoverUrl(playlist);
  if (cover) {
    return img(cover, { width: size, height: size, borderRadius: radius, objectFit: 'cover' });
  }
  const thumbs = getGridThumbnails(playlist);
  if (thumbs.length === 0) {
    return h('div', {
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: size, height: size, borderRadius: radius, background: COLORS.card,
    }, img(LOGO_DATA_URI, { width: size * 0.3, height: size * 0.3 }));
  }
  // 곡이 4곡 미만이면 첫 썸네일로 채움 (앱의 2x2 커버와 동일한 구성)
  const cells = [0, 1, 2, 3].map(i => thumbs[i] || thumbs[0]);
  const cell = size / 2;
  const cornerRadius = [
    { borderTopLeftRadius: radius },
    { borderTopRightRadius: radius },
    { borderBottomLeftRadius: radius },
    { borderBottomRightRadius: radius },
  ];
  return h('div', {
    display: 'flex', flexWrap: 'wrap', width: size, height: size,
    borderRadius: radius, background: COLORS.card,
  }, ...cells.map((src, i) => img(src, { width: cell, height: cell, objectFit: 'cover', ...cornerRadius[i] })));
}

function playlistCard(playlist) {
  const title = truncate(playlist.title || '플레이리스트', 36);
  const author = getAuthorLabel(playlist);
  const meta = `${author ? `${truncate(author, 16)} · ` : ''}${playlist.tracks.length}곡`;
  const trackLines = playlist.tracks.slice(0, 3).map((t, i) =>
    h('div', { display: 'flex', gap: 14, fontSize: 24, color: COLORS.sub, lineHeight: 1.3 },
      h('span', { color: COLORS.dim, width: 18 }, String(i + 1)),
      truncate([t.custom_title, t.custom_artist].filter(Boolean).join(' · '), 30),
    ));

  return h('div', {
    display: 'flex', width: '100%', height: '100%', padding: 72, gap: 64,
    alignItems: 'center', fontFamily: 'Noto Sans KR', color: COLORS.text,
    backgroundColor: COLORS.bg,
    backgroundImage: `radial-gradient(circle at 18% 30%, ${COLORS.bgWarm} 0%, ${COLORS.bg} 60%)`,
  },
    coverArt(playlist, 440),
    h('div', { display: 'flex', flexDirection: 'column', flex: 1, height: 486, justifyContent: 'space-between' },
      h('div', { display: 'flex', flexDirection: 'column' },
        h('div', { display: 'flex', fontSize: 22, fontWeight: 700, color: COLORS.warm, letterSpacing: '0.12em', marginBottom: 14 }, 'PLAYLIST'),
        h('div', { display: 'flex', fontSize: 58, fontWeight: 700, lineHeight: 1.2, maxHeight: 140, overflow: 'hidden' }, title),
        h('div', { display: 'flex', fontSize: 28, color: COLORS.sub, marginTop: 14 }, meta),
        h('div', { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 26 }, ...trackLines),
      ),
      h('div', { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
        logoRow(40, 40),
        ctaPill(),
      ),
    ),
  );
}

function brandCard() {
  return h('div', {
    display: 'flex', flexDirection: 'column', width: '100%', height: '100%',
    alignItems: 'center', justifyContent: 'center', gap: 36,
    fontFamily: 'Noto Sans KR', color: COLORS.text,
    backgroundColor: COLORS.bg,
    backgroundImage: `radial-gradient(circle at 50% 35%, ${COLORS.bgWarm} 0%, ${COLORS.bg} 65%)`,
  },
    logoRow(96, 104),
    h('div', { display: 'flex', fontSize: 40, color: COLORS.sub }, TAGLINE),
    ctaPill(),
  );
}

function collectText(node, out = []) {
  if (node == null || node === false) return out;
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node));
  } else if (Array.isArray(node)) {
    node.forEach(n => collectText(n, out));
  } else if (node.props) {
    collectText(node.props.children, out);
  }
  return out;
}

export default async function handler(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  let playlist = null;
  try {
    playlist = await fetchPublicPlaylist(id);
  } catch {
    playlist = null;
  }

  const tree = playlist ? playlistCard(playlist) : brandCard();
  const allText = collectText(tree).join('') + 'PLAYLIST0123456789·…';

  const [notoRegular, notoBold, outfitLight, outfitRegular] = await Promise.all([
    loadGoogleFont('Noto Sans KR', 400, allText),
    loadGoogleFont('Noto Sans KR', 700, allText),
    loadGoogleFont('Outfit', 300, 'so'),
    loadGoogleFont('Outfit', 400, 'far'),
  ]);

  // 버전(v)이 붙은 URL은 내용이 바뀌면 URL도 바뀌므로 길게 캐시
  const cacheControl = playlist && searchParams.get('v')
    ? 'public, max-age=86400, s-maxage=31536000, immutable'
    : 'public, max-age=3600, s-maxage=3600';

  const response = new ImageResponse(tree, {
    width: OG_IMAGE_WIDTH,
    height: OG_IMAGE_HEIGHT,
    fonts: [
      { name: 'Noto Sans KR', data: notoRegular, weight: 400, style: 'normal' },
      { name: 'Noto Sans KR', data: notoBold, weight: 700, style: 'normal' },
      { name: 'Outfit', data: outfitLight, weight: 300, style: 'normal' },
      { name: 'Outfit', data: outfitRegular, weight: 400, style: 'normal' },
    ],
  });
  response.headers.set('Cache-Control', cacheControl);
  return response;
}
