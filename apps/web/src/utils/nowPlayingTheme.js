/**
 * Now Playing 테마 (플레이리스트별 배경 / 파티클 효과)
 *
 * 저장 형태 (playlists.now_playing_theme JSONB 또는 localStorage 'sofar_playlist_themes'):
 * {
 *   background: string,      // 배경 이미지 URL ('' = 기본 앨범 커버 블러 배경)
 *   effect: 'none' | 'snow' | 'rain' | 'sakura' | 'fireflies',
 *   intensity: 'low' | 'medium' | 'high',
 *   dim: number,             // 0 ~ 0.8 배경 어둡기
 *   blur: number,            // 0 ~ 1 배경 흐림 (실제 화면에서 최대 BACKGROUND_MAX_BLUR_PX)
 *   grain: boolean,          // 필름 질감(노이즈)
 *   vignette: boolean,       // 비네트 (직접 고른 배경에만 적용, 기본 켜짐)
 *   grayscale: boolean       // 흑백 (직접 고른 배경에만 적용)
 * }
 */

const THEMES_STORAGE_KEY = 'sofar_playlist_themes';

const unsplash = (id) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1920&q=80`;

export const THEME_BACKGROUND_PRESETS = [
  { label: '앨범 커버', url: '' },
  { label: '밤 산책', url: unsplash('1519501025264-65ba15a82390') },
  { label: '비 오는 날', url: unsplash('1515694346937-94d85e41e6f0') },
  { label: '카페 라운지', url: unsplash('1501339847302-ac426a4a7cbb') },
  { label: '로파이', url: unsplash('1518609878373-06d740f60d8b') },
  { label: '여름 바다', url: unsplash('1507525428034-b723cf961d3e') },
  { label: '봄 감성', url: unsplash('1490750967868-88aa4486c946') },
];

export const THEME_EFFECTS = [
  { value: 'none', label: '없음' },
  { value: 'snow', label: '눈' },
  { value: 'rain', label: '비' },
  { value: 'sakura', label: '벚꽃' },
  { value: 'fireflies', label: '반딧불' },
];

export const THEME_INTENSITIES = [
  { value: 'low', label: '적게' },
  { value: 'medium', label: '보통' },
  { value: 'high', label: '많이' },
];

// 배경 흐림 최대값 (blur 1 = 24px)
export const BACKGROUND_MAX_BLUR_PX = 24;

export const DEFAULT_THEME = {
  background: '',
  effect: 'none',
  intensity: 'medium',
  dim: 0.35,
  blur: 0,
  grain: false,
  vignette: true,
  grayscale: false,
};

const EFFECT_VALUES = THEME_EFFECTS.map((e) => e.value);
const INTENSITY_VALUES = THEME_INTENSITIES.map((i) => i.value);

export function normalizeTheme(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_THEME };
  const dim = Number(raw.dim);
  const blur = Number(raw.blur);
  return {
    background: typeof raw.background === 'string' ? raw.background.trim() : '',
    effect: EFFECT_VALUES.includes(raw.effect) ? raw.effect : 'none',
    intensity: INTENSITY_VALUES.includes(raw.intensity) ? raw.intensity : 'medium',
    dim: Number.isFinite(dim) ? Math.min(0.8, Math.max(0, dim)) : DEFAULT_THEME.dim,
    blur: Number.isFinite(blur) ? Math.min(1, Math.max(0, blur)) : DEFAULT_THEME.blur,
    grain: raw.grain === true,
    vignette: raw.vignette !== false,
    grayscale: raw.grayscale === true,
  };
}

/** 테마가 기본값과 달라 실제로 화면에 적용할 내용이 있는지 */
export function hasCustomTheme(theme) {
  return Boolean(theme && (theme.background || theme.effect !== 'none' || theme.grain));
}

/** 배경 이미지에 적용할 CSS filter (흐림 px + 흑백) */
export function backgroundFilter(blurPx, grayscale) {
  const parts = [];
  if (blurPx > 0) parts.push(`blur(${blurPx}px)`);
  if (grayscale) parts.push('grayscale(1)');
  return parts.length ? parts.join(' ') : undefined;
}

/* ── 로컬 테마 저장소 변경 구독 (저장 즉시 Now Playing 화면에 반영하기 위함) ── */
let themesVersion = 0;
const themeListeners = new Set();

function emitThemesChange() {
  themesVersion += 1;
  themeListeners.forEach((l) => l());
}

export function subscribeThemes(listener) {
  themeListeners.add(listener);
  const onStorage = (e) => {
    if (e.key === THEMES_STORAGE_KEY || e.key === 'sofar_playlists') emitThemesChange();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    themeListeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function getThemesVersion() {
  return themesVersion;
}

function readThemesMap() {
  try {
    const raw = localStorage.getItem(THEMES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

export function saveLocalPlaylistTheme(playlistId, theme) {
  if (!playlistId) return;
  try {
    const map = readThemesMap();
    if (theme) map[playlistId] = normalizeTheme(theme);
    else delete map[playlistId];
    localStorage.setItem(THEMES_STORAGE_KEY, JSON.stringify(map));
  } catch (e) {}
  emitThemesChange();
}

/**
 * 플레이리스트의 테마를 반환합니다.
 * DB 컬럼(now_playing_theme)이 아직 없는 환경에서도 동작하도록 localStorage 사본을 함께 확인합니다.
 */
export function getPlaylistTheme(playlist) {
  if (!playlist) return normalizeTheme(null);
  const fromRow = playlist.now_playing_theme;
  if (fromRow && typeof fromRow === 'object') return normalizeTheme(fromRow);
  return normalizeTheme(readThemesMap()[playlist.id]);
}
