/**
 * 검색 결과 캐싱 유틸리티 (메모리 + sessionStorage)
 * 새로고침 또는 재방문 시 스켈레톤 깜빡임 없이 즉각적인 UI 렌더링을 지원합니다.
 */

const MEMORY_SEARCH_CACHE = new Map();
const CACHE_STORAGE_KEY_PREFIX = 'sofar_search_cache_';
const MAX_CACHE_ITEMS = 30;
const CACHE_TTL_MS = 1000 * 60 * 60 * 2; // 2시간 유효

export function getSearchCache(query) {
  if (!query || !query.trim()) return null;
  const key = query.trim().toLowerCase();

  // 1. 메모리 캐시 확인
  if (MEMORY_SEARCH_CACHE.has(key)) {
    const cached = MEMORY_SEARCH_CACHE.get(key);
    if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
    MEMORY_SEARCH_CACHE.delete(key);
  }

  // 2. sessionStorage 캐시 확인
  try {
    const raw = sessionStorage.getItem(`${CACHE_STORAGE_KEY_PREFIX}${key}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.timestamp < CACHE_TTL_MS) {
        // 메모리 캐시에도 동기화
        MEMORY_SEARCH_CACHE.set(key, parsed);
        return parsed.data;
      }
      sessionStorage.removeItem(`${CACHE_STORAGE_KEY_PREFIX}${key}`);
    }
  } catch (e) {
    // sessionStorage 접근 불가 시 무시
  }

  return null;
}

export function setSearchCache(query, data) {
  if (!query || !query.trim() || !Array.isArray(data)) return;
  const key = query.trim().toLowerCase();
  const cacheObj = {
    timestamp: Date.now(),
    data
  };

  // 메모리 캐시 저장
  if (MEMORY_SEARCH_CACHE.size >= MAX_CACHE_ITEMS) {
    const oldestKey = MEMORY_SEARCH_CACHE.keys().next().value;
    MEMORY_SEARCH_CACHE.delete(oldestKey);
  }
  MEMORY_SEARCH_CACHE.set(key, cacheObj);

  // sessionStorage 저장
  try {
    sessionStorage.setItem(`${CACHE_STORAGE_KEY_PREFIX}${key}`, JSON.stringify(cacheObj));
  } catch (e) {
    // 용량 초과 등의 에러 방어
  }
}
