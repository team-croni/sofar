/**
 * 링크 미리보기 카드 이미지 (1200x630, 1.91:1)
 *
 * GET /api/og?id=<playlistId>&v=<version>
 *  - 공개 플레이리스트: 커버(또는 곡 썸네일 2x2) + 큰 제목 + "플레이리스트 · N곡" + sofar 로고
 *    모바일 메신저처럼 카드가 작게 보여도 읽히도록 요소를 최소화하고 글자를 크게 둔다.
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
} from '../server/sharedPlaylist.js';

export const config = { runtime: 'edge' };

const COLORS = {
  bg: '#121212',
  bgWarm: '#211a14',
  warm: '#D4A373',
  text: '#F5F2EE',
  sub: '#B5AEA8',
  card: '#1E1E1E',
};

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 64" fill="none"><path d="M23.6902 27.1724C30.9866 34.4689 20.8527 3.58695 47.2753 30.0098C73.698 56.4327 51.7343 13.7209 44.4379 6.4244C37.1415 -0.872077 26.5821 -2.14244 20.8527 3.58695C15.1234 9.31635 16.3938 19.8759 23.6902 27.1724Z" fill="#D4A373"/><path d="M36.2525 32.827C28.9561 25.5306 39.09 56.4125 12.6674 29.9896C-13.7553 3.5667 8.20837 46.2785 15.5048 53.575C22.8012 60.8715 33.3606 62.1419 39.09 56.4125C44.8193 50.6831 43.5489 40.1235 36.2525 32.827Z" fill="#D4A373"/></svg>`;
const LOGO_DATA_URI = `data:image/svg+xml;base64,${btoa(LOGO_SVG)}`;

const TAGLINE = '광고 없이 가사 보며 듣는 유튜브 음악';

// 레이아웃 (1200x630)
const PADDING = 64;
const GAP = 60;
const COVER_SIZE = OG_IMAGE_HEIGHT - PADDING * 2; // 502
const TEXT_WIDTH = OG_IMAGE_WIDTH - PADDING * 2 - COVER_SIZE - GAP; // 510

// 제목 글자 크기 후보 (큰 것부터)와 크기별 최대 줄 수.
// 들어가는 가장 큰 크기를 사용하고, 작은 크기일수록 줄을 더 허용한다 (로고·곡 수 영역과 겹치지 않는 범위)
const TITLE_STEPS = [
  { fontSize: 92, maxLines: 2 },
  { fontSize: 80, maxLines: 2 },
  { fontSize: 68, maxLines: 3 },
  { fontSize: 58, maxLines: 3 },
  { fontSize: 50, maxLines: 4 },
];
const TITLE_LINE_HEIGHT = 1.15;

// satori는 JSX 없이 { type, props } 트리를 그대로 받는다
const h = (type, style, ...children) => ({
  type,
  props: { style, children: children.length === 1 ? children[0] : children },
});
const img = (src, style) => ({ type: 'img', props: { src, style } });

/** Google Fonts에서 필요한 글자만 서브셋으로 받아오기 (satori는 woff2 미지원 → ttf/otf) */
async function loadGoogleFont(family, weight, text) {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&text=${encodeURIComponent(text)}`;
  const css = await (await fetchWithTimeout(cssUrl)).text();
  const match = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/);
  if (!match) throw new Error(`font not found: ${family} ${weight}`);
  return (await fetchWithTimeout(match[1])).arrayBuffer();
}

/** Noto Sans KR Bold 기준 글자 폭 근사치 (em 단위) */
function charWidthEm(ch) {
  if (/\s/.test(ch)) return 0.26;
  if (/[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af\u3040-\u30ff\u4e00-\u9fff\uff00-\uffef]/.test(ch)) return 0.95;
  if (/[A-Z0-9]/.test(ch)) return 0.66;
  if (/[a-z]/.test(ch)) return 0.56;
  return 0.4;
}

const MAX_LINE_WIDTH = TEXT_WIDTH * 0.94; // 줄바꿈 위치 오차 여유
const textWidth = (text, fontSize) => Array.from(text).reduce((sum, ch) => sum + charWidthEm(ch) * fontSize, 0);

/**
 * 어절(띄어쓰기) 단위 줄바꿈(word-break: keep-all)으로 필요한 줄 수.
 * 한 어절이 한 줄보다 길면 이 크기로는 표시 불가(Infinity)
 */
function countLines(text, fontSize) {
  const words = text.split(/\s+/).filter(Boolean);
  const space = charWidthEm(' ') * fontSize;
  let lines = 1;
  let width = 0;
  for (const word of words) {
    const w = textWidth(word, fontSize);
    if (w > MAX_LINE_WIDTH) return Infinity;
    if (width === 0) {
      width = w;
    } else if (width + space + w <= MAX_LINE_WIDTH) {
      width += space + w;
    } else {
      lines += 1;
      width = w;
    }
  }
  return lines;
}

/** 제목 길이에 맞춰 글자 크기를 고르고, 가장 작은 크기에서도 넘치면 어절 단위로 잘라 말줄임 */
function fitTitle(rawTitle) {
  const text = rawTitle.trim().replace(/\s+/g, ' ');
  for (const step of TITLE_STEPS) {
    if (countLines(text, step.fontSize) <= step.maxLines) {
      return { text, ...step };
    }
  }
  const step = TITLE_STEPS[TITLE_STEPS.length - 1];
  const words = text.split(' ');
  // 어절 단위로 줄여보고, 한 어절이 너무 긴 경우 글자 단위로 줄임
  while (words.length > 1 && countLines(`${words.join(' ')}…`, step.fontSize) > step.maxLines) words.pop();
  let truncated = words.join(' ');
  while (truncated.length > 1 && countLines(`${truncated}…`, step.fontSize) > step.maxLines) {
    truncated = Array.from(truncated).slice(0, -1).join('');
  }
  return { text: `${truncated.trimEnd()}…`, ...step };
}

function logoRow(iconSize) {
  return h('div', { display: 'flex', alignItems: 'center', gap: Math.round(iconSize * 0.28) },
    img(LOGO_DATA_URI, { width: iconSize, height: iconSize }),
    h('div', { display: 'flex', fontFamily: 'Outfit', fontSize: Math.round(iconSize * 1.08), letterSpacing: '0.02em', lineHeight: 1 },
      h('span', { color: COLORS.text, fontWeight: 300 }, 'so'),
      h('span', { color: COLORS.warm, fontWeight: 400 }, 'far'),
    ),
  );
}

function coverArt(playlist, size) {
  const radius = 40;
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
  // satori는 부모 radius로 자식을 잘라내지 않으므로 바깥 모서리마다 radius 지정
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
  const { text: title, fontSize } = fitTitle(playlist.title || '플레이리스트');

  return h('div', {
    display: 'flex', width: '100%', height: '100%', padding: PADDING, gap: GAP,
    alignItems: 'center', fontFamily: 'Noto Sans KR', color: COLORS.text,
    backgroundColor: COLORS.bg,
    backgroundImage: `radial-gradient(circle at 20% 30%, ${COLORS.bgWarm} 0%, ${COLORS.bg} 62%)`,
  },
    coverArt(playlist, COVER_SIZE),
    // 오른쪽 섹션 높이를 커버와 동일하게 맞춰 제목·로고를 커버 위아래 끝선에 정렬
    h('div', { display: 'flex', flexDirection: 'column', width: TEXT_WIDTH, height: COVER_SIZE, justifyContent: 'space-between' },
      h('div', { display: 'flex', flexDirection: 'column', gap: 18 },
        h('div', {
          display: 'flex', fontSize, fontWeight: 700, lineHeight: TITLE_LINE_HEIGHT,
          wordBreak: 'keep-all', marginTop: -Math.round(fontSize * 0.12),
        }, title),
        h('div', { display: 'flex', fontSize: 46, color: COLORS.sub, lineHeight: 1.2 }, `플레이리스트 · ${playlist.tracks.length}곡`),
      ),
      logoRow(64),
    ),
  );
}

function brandCard() {
  return h('div', {
    display: 'flex', flexDirection: 'column', width: '100%', height: '100%',
    alignItems: 'center', justifyContent: 'center', gap: 40,
    fontFamily: 'Noto Sans KR', color: COLORS.text,
    backgroundColor: COLORS.bg,
    backgroundImage: `radial-gradient(circle at 50% 40%, ${COLORS.bgWarm} 0%, ${COLORS.bg} 65%)`,
  },
    logoRow(110),
    h('div', { display: 'flex', fontSize: 46, color: COLORS.sub }, TAGLINE),
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
  const allText = collectText(tree).join('') + '0123456789·…';

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
