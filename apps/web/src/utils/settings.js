/**
 * 기기별 앱 설정 저장소 (localStorage `sofar_settings` 하나에 묶어 보관)
 * - 게스트/로그인 구분 없이 이 기기에서만 적용되는 재생·가사·화면 설정
 * - 계정 단위 설정(공개 기본값 등)은 useAccountPreferences(profiles.preferences)에서 다룬다
 * - React 밖(AudioContext 초기화 등)에서도 getSettings()로 동기 조회 가능
 */

export const SETTINGS_STORAGE_KEY = 'sofar_settings';

export const DEFAULT_SETTINGS = {
  // 재생
  startupRepeatMode: 'keep', // 'keep' | 'none' | 'all' | 'one'
  sleepFadeOut: true,
  resumeOnLaunch: true,
  // 가사
  startupLyrics: 'keep', // 'keep' | 'show' | 'hide'
  lyricsSize: 'md', // 'sm' | 'md' | 'lg'
  lyricsClickSeek: true,
  // 화면 · Now Playing
  albumBlurBackground: true,
  themeEffects: true,
  reduceMotion: 'system', // 'system' | 'on' | 'off'
};

const ALLOWED = {
  startupRepeatMode: ['keep', 'none', 'all', 'one'],
  startupLyrics: ['keep', 'show', 'hide'],
  lyricsSize: ['sm', 'md', 'lg'],
  reduceMotion: ['system', 'on', 'off'],
};

function normalize(raw) {
  const next = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return next;
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    const value = raw[key];
    const fallback = DEFAULT_SETTINGS[key];
    if (typeof fallback === 'boolean') {
      if (typeof value === 'boolean') next[key] = value;
    } else if (ALLOWED[key]?.includes(value)) {
      next[key] = value;
    }
  }
  return next;
}

function load() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    return normalize(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

let current = load();
const listeners = new Set();

export function getSettings() {
  return current;
}

export function subscribeSettings(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function updateSettings(patch) {
  current = normalize({ ...current, ...patch });
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* 저장 실패해도 이번 세션에는 적용 */
  }
  applySettingsToDocument(current);
  listeners.forEach((l) => l());
}

export function resetSettings() {
  updateSettings({ ...DEFAULT_SETTINGS });
}

const LYRICS_SCALE = { sm: 0.88, md: 1, lg: 1.18 };

function systemPrefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function isReducedMotion(settings = current) {
  if (settings.reduceMotion === 'on') return true;
  if (settings.reduceMotion === 'off') return false;
  return Boolean(systemPrefersReducedMotion());
}

/** CSS로 처리하는 설정을 <html> 속성/변수로 반영 */
export function applySettingsToDocument(settings = current) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--lyrics-scale', String(LYRICS_SCALE[settings.lyricsSize] || 1));
  root.classList.toggle('reduce-motion', isReducedMotion(settings));
  root.classList.toggle('no-album-blur', !settings.albumBlurBackground);
  root.classList.toggle('lyrics-no-click-seek', !settings.lyricsClickSeek);
}

if (typeof window !== 'undefined') {
  applySettingsToDocument(current);
  // 다른 탭에서 바꾼 설정도 반영
  window.addEventListener('storage', (e) => {
    if (e.key !== SETTINGS_STORAGE_KEY) return;
    current = load();
    applySettingsToDocument(current);
    listeners.forEach((l) => l());
  });
  // '시스템 설정 따르기'일 때 OS 설정 변경 반영
  window.matchMedia?.('(prefers-reduced-motion: reduce)')
    .addEventListener?.('change', () => {
      applySettingsToDocument(current);
      listeners.forEach((l) => l());
    });
}
