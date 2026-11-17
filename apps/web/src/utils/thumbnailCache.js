const CACHE_KEY = 'sofar_itunes_thumbnail_cache_v3';
const MAX_CONCURRENT_LOOKUPS = 2;
const NEGATIVE_CACHE_TTL_MS = 10 * 60 * 1000;

export function isYoutubeThumbnail(url) {
  if (typeof url !== 'string') return false;
  return url.includes('img.youtube.com') || url.includes('i.ytimg.com') || url.includes('ytimg.com');
}

// 유튜브는 존재하지 않거나 삭제된 영상의 썸네일 요청에 404와 함께 120x90 회색 placeholder 이미지를 보낸다.
// 이미지 자체는 정상 디코딩되므로 onError가 발생하지 않아, 로드 후 크기로 판별해야 한다.
// (실제 hqdefault 썸네일은 480x360)
export function isYoutubePlaceholderImage(img) {
  if (!img || !isYoutubeThumbnail(img.currentSrc || img.src)) return false;
  return img.naturalWidth === 120 && img.naturalHeight === 90;
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

// ---------------------------------------------------------------------------
// iTunes 메타데이터(앨범아트 + 원곡 재생길이) 조회
// ---------------------------------------------------------------------------
// 주의: iTunes Search API에 country=kr을 붙이면 현재 모든 검색이 0건으로 돌아온다.
// 기본(US) 스토어에도 국내 음원이 한글 제목으로 등록되어 있으므로 country를 지정하지 않는다.
const DURATION_CACHE_KEY = 'sofar_itunes_duration_cache_v1';
const VARIANT_PATTERN = /(acoustic|어쿠스틱|instrumental|inst\.?\b|\bmr\b|반주|live|라이브|remix|리믹스|ver\.|version|piano|피아노|remaster|karaoke|sped up|slowed)/i;

let durationMap = {};
try {
  const persisted = localStorage.getItem(DURATION_CACHE_KEY);
  if (persisted) durationMap = JSON.parse(persisted);
} catch (e) {}

const pendingMeta = new Map();
const metaNegative = new Map();

function persistDurations() {
  try {
    localStorage.setItem(DURATION_CACHE_KEY, JSON.stringify(durationMap));
  } catch (e) {}
}

function normalizeText(str) {
  return (str || '')
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/[^0-9a-zㄱ-ㆎ가-힣]+/g, '');
}

const hasHangul = (str) => /[가-힣]/.test(str || '');

/**
 * 검색 결과 중 요청한 곡과 실제로 같은 곡을 고른다.
 * - 제목이 정확히 같아야 하며(괄호 부분 제외), 어쿠스틱/MR 등 파생 버전은 요청하지 않았다면 제외한다.
 * - 아티스트명이 같은 문자 체계(한글/영문)라면 일치해야 한다.
 *   국내 가수는 iTunes에 영문명(예: 버즈 → Buzz)으로 등록된 경우가 많아, 문자 체계가 다르면
 *   검색어에 아티스트를 함께 넣어 검색한 결과이므로 허용한다.
 */
function pickBestItunesResult(results, artist, title, { strictArtist = false } = {}) {
  const wantTitle = normalizeText(title);
  const wantArtist = normalizeText(artist);
  const wantsVariant = VARIANT_PATTERN.test(title || '');
  if (!wantTitle) return null;

  let best = null;
  let bestScore = -Infinity;
  for (const r of results || []) {
    const gotTitle = normalizeText(r.trackName);
    if (!gotTitle) continue;
    if (!wantsVariant && VARIANT_PATTERN.test(r.trackName || '')) continue;

    let score = 0;
    if (gotTitle === wantTitle) score += 10;
    else if (gotTitle.startsWith(wantTitle) || wantTitle.startsWith(gotTitle)) score += 4;
    else continue;

    const gotArtist = normalizeText(r.artistName);
    if (wantArtist && gotArtist) {
      if (gotArtist.includes(wantArtist) || wantArtist.includes(gotArtist)) {
        score += 6;
      } else if (strictArtist || hasHangul(artist) === hasHangul(r.artistName)) {
        continue; // 다른 가수의 동명이곡
      }
    }

    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best;
}

async function fetchItunes(term) {
  const response = await fetch(
    `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=15`
  );
  if (!response.ok) return [];
  const data = await response.json();
  return data.results || [];
}

/**
 * iTunes에서 곡의 앨범아트(600x600)와 원곡 재생길이(초)를 조회한다.
 * 동일 곡 요청은 하나의 Promise를 공유한다.
 */
export function lookupItunesMeta(artist, title, { queued = true } = {}) {
  if (!title) return Promise.resolve(null);
  const key = getKey(artist, title);
  const retryAfter = metaNegative.get(key);
  if (retryAfter && retryAfter > Date.now()) return Promise.resolve(null);
  if (pendingMeta.has(key)) return pendingMeta.get(key);

  const run = async () => {
    try {
      let results = await fetchItunes(`${artist || ''} ${title}`.trim());
      let best = pickBestItunesResult(results, artist, title);
      if (!best && artist) {
        // 제목만으로 다시 검색할 때는 아티스트가 확실히 일치하는 결과만 허용한다
        results = await fetchItunes(title);
        best = pickBestItunesResult(results, artist, title, { strictArtist: true });
      }
      if (!best) {
        metaNegative.set(key, Date.now() + NEGATIVE_CACHE_TTL_MS);
        return null;
      }
      const durationSec = best.trackTimeMillis ? Math.round(best.trackTimeMillis / 1000) : 0;
      if (durationSec > 0) {
        durationMap[key] = durationSec;
        persistDurations();
        window.dispatchEvent(new CustomEvent('itunes-duration-cached', {
          detail: { key, duration: durationSec }
        }));
      }
      const artwork = best.artworkUrl100
        ? best.artworkUrl100.replace(/\/[0-9]+x[0-9]+(bb)?/, '/600x600bb')
        : null;
      return { artwork, durationSec };
    } catch (e) {
      metaNegative.set(key, Date.now() + NEGATIVE_CACHE_TTL_MS);
      return null;
    } finally {
      pendingMeta.delete(key);
    }
  };
  // thumbnailCache.resolve 내부(이미 큐 슬롯을 점유한 상태)에서 호출할 때는 다시 큐에 넣지 않는다 (교착 방지)
  const task = queued ? enqueueLookup(run) : run();
  pendingMeta.set(key, task);
  return task;
}

/** 재생 전에도 목록에 표시할 원곡 재생길이(초). 캐시에 없으면 iTunes에서 조회한다. */
export const itunesDurationCache = {
  keyOf: getKey,
  get(artist, title) {
    if (!title) return 0;
    return durationMap[getKey(artist, title)] || 0;
  },
  async resolve(artist, title) {
    const cached = this.get(artist, title);
    if (cached) return cached;
    const meta = await lookupItunesMeta(artist, title);
    if (meta?.durationSec) return meta.durationSec;
    // iTunes는 국내 곡을 영문 제목(예: 나무 → Tree)으로만 돌려주는 경우가 있어 제목 확인에서 걸러진다.
    // 이때는 재생 시 매칭될 유튜브 영상(백엔드 검색 1순위)의 길이로 대신 표시한다.
    return resolveYoutubeDuration(artist, title);
  }
};

const pendingYoutubeDuration = new Map();
const youtubeDurationNegative = new Map();

function resolveYoutubeDuration(artist, title) {
  if (!title) return Promise.resolve(0);
  const key = getKey(artist, title);
  const retryAfter = youtubeDurationNegative.get(key);
  if (retryAfter && retryAfter > Date.now()) return Promise.resolve(0);
  if (pendingYoutubeDuration.has(key)) return pendingYoutubeDuration.get(key);

  const task = enqueueLookup(async () => {
    try {
      const { searchYoutube } = await import('./youtube');
      const results = await searchYoutube(`${artist || ''} ${title}`.trim());
      const sec = Number(results?.[0]?.durationSec || results?.[0]?.duration || 0);
      if (sec > 0) {
        durationMap[key] = sec;
        persistDurations();
        return sec;
      }
      youtubeDurationNegative.set(key, Date.now() + NEGATIVE_CACHE_TTL_MS);
      return 0;
    } catch (e) {
      youtubeDurationNegative.set(key, Date.now() + NEGATIVE_CACHE_TTL_MS);
      return 0;
    } finally {
      pendingYoutubeDuration.delete(key);
    }
  });
  pendingYoutubeDuration.set(key, task);
  return task;
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

        const meta = await lookupItunesMeta(artist, title, { queued: false });
        if (meta?.artwork) {
          this.set(artist, title, meta.artwork);
          return meta.artwork;
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
