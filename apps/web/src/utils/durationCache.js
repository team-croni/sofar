/**
 * durationCache.js
 * 
 * In-memory cache for YouTube video durations (in seconds).
 * Keyed by youtube_video_id.
 */

const loadPersistedCache = () => {
  try {
    const saved = localStorage.getItem('sofar_duration_cache');
    if (saved) {
      const parsed = JSON.parse(saved);
      return new Map(Object.entries(parsed));
    }
  } catch (e) {}
  return new Map();
};

export const durationCache = loadPersistedCache();

export function saveDurationCache() {
  try {
    const obj = {};
    durationCache.forEach((val, key) => {
      if (key && val > 0) obj[key] = val;
    });
    localStorage.setItem('sofar_duration_cache', JSON.stringify(obj));
  } catch (e) {}
}

/**
 * Format a duration in seconds to "m:ss" or "h:mm:ss" string.
 * @param {number} seconds
 * @returns {string}
 */
export function formatDuration(seconds) {
  if (!seconds || isNaN(seconds) || seconds <= 0) return '--:--';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;

  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${m}:${String(sec).padStart(2, '0')}`;
}
