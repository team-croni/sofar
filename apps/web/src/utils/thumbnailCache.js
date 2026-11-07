const CACHE_KEY = 'sofar_itunes_thumbnail_cache_v3';
const MAX_CONCURRENT_LOOKUPS = 2;
const NEGATIVE_CACHE_TTL_MS = 10 * 60 * 1000;

export function isYoutubeThumbnail(url) {
  if (typeof url !== 'string') return false;
  return url.includes('img.youtube.com') || url.includes('i.ytimg.com') || url.includes('ytimg.com');
}

// Last.fm이 앨범 정보를 찾지 못했을 때 반환하는 공용 투명 placeholder나
// 유튜브 동영상 캡처 썸네일은 정식 앨범 자켓이 아니므로 배제한다.
export function isUsableArtwork(url) {
  return typeof url === 'string'
    && url.trim().length > 0
    && !url.includes('2a96cbd8b46e442fc41c2b86b821562f')
    && !isYoutubeThumbnail(url);
}

// Load initial cache from localStorage
let cacheMap = {};
const pendingLookups = new Map();
const negativeCache = new Map();
const lookupQueue = [];
let activeLookups = 0;

function getKey(artist, title) {
  return `${artist?.trim() || ''} - ${title?.trim() || ''}`.toLowerCase();
}

function persistCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheMap));
  } catch (e) {
    console.warn('Failed to persist thumbnail cache:', e);
  }
}

function runNextLookup() {
  while (activeLookups < MAX_CONCURRENT_LOOKUPS && lookupQueue.length > 0) {
    const next = lookupQueue.shift();
    activeLookups += 1;
    next()
      .catch(() => {})
      .finally(() => {
        activeLookups -= 1;
        runNextLookup();
      });
  }
}

function enqueueLookup(task) {
  return new Promise((resolve, reject) => {
    lookupQueue.push(async () => {
      try {
        resolve(await task());
      } catch (error) {
        reject(error);
      }
    });
    runNextLookup();
  });
}
try {
  const persisted = localStorage.getItem(CACHE_KEY);
  if (persisted) {
    cacheMap = JSON.parse(persisted);
  }
} catch (e) {
  console.warn('Failed to load persisted thumbnail cache:', e);
}

export const thumbnailCache = {
  get(artist, title) {
    if (!title) return null;
    const key = getKey(artist, title);
    const url = cacheMap[key];
    if (isUsableArtwork(url)) return url;
    if (url) {
      delete cacheMap[key];
      persistCache();
    }
    return null;
  },
  
  set(artist, title, url) {
    if (!title) return;
    const key = getKey(artist, title);

    // 실패값은 localStorage에 영구 보관하지 않는다. 일시적인 네트워크/API 오류가
    // 다음 방문에서도 앨범 커버를 막지 않도록, 메모리에서만 잠시 재시도를 막는다.
    if (!isUsableArtwork(url)) {
      delete cacheMap[key];
      negativeCache.set(key, Date.now() + NEGATIVE_CACHE_TTL_MS);
      persistCache();
      return;
    }

    negativeCache.delete(key);
    cacheMap[key] = url;
    persistCache();
  },

  /**
   * 동일 곡은 하나의 Promise를 공유하고, 서로 다른 곡도 최대 두 개만 조회한다.
   * 목록을 열 때 수십 개의 iTunes 요청이 동시에 발생하는 것을 방지한다.
   */
  async resolve(artist, title) {
    if (!title) return null;

    const cached = this.get(artist, title);
    if (cached) return cached;

    const key = getKey(artist, title);
    const retryAfter = negativeCache.get(key);
    if (retryAfter && retryAfter > Date.now()) return null;
    if (retryAfter) negativeCache.delete(key);

    const pending = pendingLookups.get(key);
    if (pending) return pending;

    const lookup = enqueueLookup(async () => {
      try {
        const { supabase } = await import('../contexts/AuthContext');
        if (supabase) {
          const { data, error } = await supabase
            .from('lyric_caches')
            .select('raw_lrc')
            .eq('artist', artist?.trim() || '')
            .eq('title', title.trim())
            .maybeSingle();

          const artworkMatch = !error && data?.raw_lrc
            ? data.raw_lrc.match(/^\[artwork:(https?:\/\/[^\]]+)\]/)
            : null;
          if (artworkMatch?.[1]) {
            this.set(artist, title, artworkMatch[1]);
            return artworkMatch[1];
          }
        }

        const query = `${title} ${artist || ''}`.trim();
        const response = await fetch(
          `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=1&country=kr`
        );
        if (response.ok) {
          const data = await response.json();
          const artworkUrl = data.results?.[0]?.artworkUrl100;
          if (artworkUrl) {
            const highResArtwork = artworkUrl.replace(/\/[0-9]+x[0-9]+/, '/600x600');
            this.set(artist, title, highResArtwork);
            return highResArtwork;
          }
        }

        // 3. iTunes 검색 실패 시 국내 음원 DB (Bugs/국내 검색) fallback 조회
        try {
          const { searchDomesticTracks } = await import('./itunes');
          const domesticTracks = await searchDomesticTracks(`${artist || ''} ${title}`.trim(), 3);
          if (domesticTracks && domesticTracks.length > 0) {
            const firstArt = domesticTracks[0]?.artwork || domesticTracks[0]?.thumbnail;
            if (isUsableArtwork(firstArt)) {
              this.set(artist, title, firstArt);
              return firstArt;
            }
          }
        } catch (domesticErr) {
          console.warn('Failed to fetch domestic artwork fallback:', domesticErr);
        }

        return null;
      } catch (error) {
        console.warn('Failed to fetch album art for thumbnail:', error);
        return null;
      } finally {
        pendingLookups.delete(key);
      }
    });

    pendingLookups.set(key, lookup);
    const result = await lookup;
    if (!result) this.set(artist, title, null);
    return result;
  }
};
