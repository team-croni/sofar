/**
 * 오디오 관련 로컬 스토리지 안전 읽기/쓰기 유틸리티 모듈
 */

export const STORAGE_KEYS = {
  CURRENT_TIME: 'sofar_current_time',
  DURATION: 'sofar_current_duration',
  VOLUME: 'sofar_volume',
  PLAYLIST: 'sofar_playlist',
  QUEUE: 'sofar_queue',
  CURRENT_TRACK: 'sofar_current_track',
  REPEAT_MODE: 'sofar_repeat_mode',
  PLAYING_SOURCE: 'sofar_playing_source',
  PLAYBACK_CONTEXT: 'sofar_playback_context',
  IS_LYRICS_HIDDEN: 'sofar_is_lyrics_hidden',
};

export const getStorageItem = (key, fallbackValue) => {
  try {
    const item = localStorage.getItem(key);
    if (item === null || item === undefined) return fallbackValue;
    if (typeof fallbackValue === 'boolean') {
      return item === 'true';
    }
    if (typeof fallbackValue === 'number') {
      const parsed = parseFloat(item);
      return isNaN(parsed) ? fallbackValue : parsed;
    }
    if (typeof fallbackValue === 'object') {
      return JSON.parse(item);
    }
    return item;
  } catch (e) {
    return fallbackValue;
  }
};

export const setStorageItem = (key, value) => {
  try {
    if (typeof value === 'object') {
      localStorage.setItem(key, JSON.stringify(value));
    } else {
      localStorage.setItem(key, String(value));
    }
  } catch (e) {
    console.warn(`Failed to save storage item ${key}:`, e);
  }
};
