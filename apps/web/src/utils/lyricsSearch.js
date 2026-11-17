/**
 * 가사 검색 공용 모듈
 * - LRCLIB API 호출 (응답 캐시 + AbortSignal 지원)
 * - 곡 제목/아티스트 정제 및 유사도 계산
 * - 후보 적합도 점수화 / 정렬
 * 자동 매칭(useLyrics)과 수동 검색(LyricsSearchModal)이 동일한 로직을 사용합니다.
 */

const LRCLIB_BASE = 'https://lrclib.net/api';
const HANGUL_RE = /[ㄱ-ㅎㅏ-ㅣ가-힣]/;

/** 자동 매칭 채택 기준 */
export const MATCH_THRESHOLD = 0.6;
/** 정제된 제목만으로 재검색했을 때의 채택 기준 (아티스트 없이 검색하므로 더 엄격) */
export const FALLBACK_MATCH_THRESHOLD = 0.65;
/** 이 점수 이상 + 싱크 가사면 정밀 매칭으로 간주 */
export const EXACT_MATCH_THRESHOLD = 0.85;
/** 수동 검색 결과에서 '추천' 배지를 붙이는 기준 */
export const RECOMMEND_THRESHOLD = 0.8;

// ─────────────────────────────────────────────
// 문자열 정제 / 비교
// ─────────────────────────────────────────────

/** 곡 제목 정제 (괄호 속 MV/Remake/Feat 등 수식어 및 대괄호 태그 제거) */
export function getCleanTitle(title) {
  if (!title) return '';
  let cleaned = title;
  cleaned = cleaned.replace(/[\[【〔][^\]】〕]*[\]】〕]/g, ' ');
  cleaned = cleaned.replace(/\s*\([^)]*(?:MV|M\/V|Video|Audio|Official|Lyrics|가사|자막|Remake|Cover|Remaster|Version|Ver\.|Edit|Acoustic|Live|Feat|with|Prod|Session|Special|Clip|Performance|Visualizer|Teaser)[^)]*\)/gi, ' ');
  cleaned = cleaned.replace(/\s*[\|_]\s*(?:MV|M\/V|Music\s+Video|Official|Audio|Video).*/gi, ' ');
  cleaned = cleaned.replace(/\s*-\s*(?:Remake|Cover|Remaster|Version|Ver\.|Edit|Acoustic|Live|Feat\.|Feat|with|MV|M\/V|Music\s+Video|Official\s+Video|Official\s+M\/V|Official\s+MV|Official\s+Audio|Official|Audio|Lyrics|가사|자막).*/gi, ' ');
  cleaned = cleaned.replace(/\b(?:MV|M\/V|Music\s+Video|Official\s+Video|Official\s+M\/V|Official\s+MV|Official\s+Audio|Official\s+Visualizer)\b/gi, ' ');
  cleaned = cleaned.replace(/['"“”‘’`]/g, '');
  return cleaned.replace(/\s+/g, ' ').trim();
}

/** 아티스트명 정제 (괄호 속 부가 정보 제거) */
export function getCleanArtist(artist) {
  if (!artist) return '';
  return artist
    .replace(/\s*[\(\[][^)\]]*[\)\]]/g, ' ')
    .replace(/['"“”‘’`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 비교용 정규화 (소문자, NFC, 문자/숫자만 남김) */
export function normalizeForCompare(str) {
  if (!str) return '';
  return str.toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}]/gu, '').trim();
}

/** 두 문자열의 유사도 (0.0 ~ 1.0) — 포함 관계 + bigram Jaccard */
export function calculateTextSimilarity(a, b) {
  const normA = normalizeForCompare(a);
  const normB = normalizeForCompare(b);
  if (!normA || !normB) return 0;
  if (normA === normB) return 1;

  if (normA.includes(normB) || normB.includes(normA)) {
    const minLen = Math.min(normA.length, normB.length);
    const maxLen = Math.max(normA.length, normB.length);
    return 0.7 + 0.3 * (minLen / maxLen);
  }

  if (normA.length < 2 || normB.length < 2) return 0;
  const bigrams = (s) => {
    const set = new Set();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const bgA = bigrams(normA);
  const bgB = bigrams(normB);
  let intersection = 0;
  for (const bg of bgA) if (bgB.has(bg)) intersection++;
  const union = bgA.size + bgB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * 유튜브식 "아티스트 - 제목" 표기를 분리하여 검색용 제목/아티스트를 만든다.
 * @returns {{ title: string, artist: string }}
 */
export function buildSearchTarget(title = '', artist = '') {
  let cleanT = getCleanTitle(title);
  const cleanA = getCleanArtist(artist);

  if (cleanT.includes(' - ')) {
    const parts = cleanT.split(' - ').map((p) => p.trim()).filter(Boolean);
    if (parts.length === 2) {
      const [p1, p2] = parts;
      const a = cleanA.toLowerCase();
      if (a && p1.toLowerCase().includes(a)) return { title: p2, artist: cleanA };
      if (a && p2.toLowerCase().includes(a)) return { title: p1, artist: cleanA };
      if (!a) return { title: p2, artist: p1 };
    }
  }

  // 제목 안에 아티스트명이 이미 들어있으면 제목에서 제거
  if (cleanA && cleanT.toLowerCase().includes(cleanA.toLowerCase()) && cleanT.length > cleanA.length) {
    const stripped = cleanT.replace(new RegExp(cleanA.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '').replace(/^[\s\-–|:]+|[\s\-–|:]+$/g, '').trim();
    if (stripped) cleanT = stripped;
  }

  return { title: cleanT, artist: cleanA };
}

// ─────────────────────────────────────────────
// 후보 정보 헬퍼
// ─────────────────────────────────────────────

export function getCandidateLyrics(cand) {
  return cand?.syncedLyrics || cand?.plainLyrics || '';
}

export function hasLyrics(cand) {
  return Boolean(getCandidateLyrics(cand).trim());
}

/** 미리보기용: 타임태그/메타태그를 제거한 가사 라인 목록 */
export function getPlainLines(cand) {
  const raw = getCandidateLyrics(cand);
  if (!raw) return [];
  return raw
    .split('\n')
    .map((line) => line.replace(/\[\d{1,3}:\d{2}(?:\.\d{1,3})?\]/g, '').replace(/^\[[a-z]+:.*\]$/i, '').trim());
}

export function formatDuration(sec) {
  if (!sec || !Number.isFinite(sec)) return '';
  const total = Math.round(sec);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────
// 점수화
// ─────────────────────────────────────────────

/**
 * 후보의 적합도 점수 (0 = 탈락, 대략 0.0 ~ 1.2)
 * @param {object} cand LRCLIB 레코드
 * @param {{ title: string, artist?: string, duration?: number }} target 원곡 정보
 */
export function scoreLyricCandidate(cand, target) {
  if (!cand || !hasLyrics(cand)) return 0;

  const targetTitle = getCleanTitle(target.title);
  const targetArtist = getCleanArtist(target.artist);
  const candTitle = getCleanTitle(cand.trackName || cand.name || '');
  const candArtist = getCleanArtist(cand.artistName || '');

  const titleScore = calculateTextSimilarity(targetTitle, candTitle);
  const artistScore = calculateTextSimilarity(targetArtist, candArtist);
  const hasTargetArtist = Boolean(normalizeForCompare(targetArtist));

  // 1. 제목이 크게 다르면 탈락
  if (titleScore < 0.45) return 0;
  // 2. 아티스트가 완전히 다르고 제목도 완전 일치가 아니면 탈락
  if (hasTargetArtist && artistScore < 0.3 && titleScore < 0.95) return 0;
  // 3. 한국어 곡인데 가사에 한글이 전혀 없으면 (번역/로마자 가사) 엄격하게
  const isTargetKorean = HANGUL_RE.test(targetTitle) || HANGUL_RE.test(targetArtist);
  if (isTargetKorean && !HANGUL_RE.test(getCandidateLyrics(cand))) {
    if (titleScore < 0.95 || (hasTargetArtist && artistScore < 0.6)) return 0;
  }

  let score = hasTargetArtist ? titleScore * 0.65 + artistScore * 0.35 : titleScore;

  // 4. 싱크 가사 보너스
  if (cand.syncedLyrics) score += 0.1;

  // 5. 곡 길이 비교 (원곡 길이를 알 때만)
  const targetDur = Number(target.duration) || 0;
  const candDur = Number(cand.duration) || 0;
  if (targetDur > 0 && candDur > 0) {
    const diff = Math.abs(targetDur - candDur);
    if (diff <= 3) score += 0.05;
    else if (diff > 30) score -= 0.15;
    else if (diff > 10) score -= 0.05;
  }

  return score;
}

/**
 * 후보 목록을 중복 제거 후 점수순으로 정렬
 * @returns {Array<{ cand: object, score: number }>}
 */
export function rankCandidates(candidates, target) {
  const seenIds = new Set();
  const scored = [];

  for (const cand of candidates) {
    if (!hasLyrics(cand)) continue;
    if (cand.id != null) {
      if (seenIds.has(cand.id)) continue;
      seenIds.add(cand.id);
    }
    scored.push({ cand, score: target?.title ? scoreLyricCandidate(cand, target) : 0 });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return Number(Boolean(b.cand.syncedLyrics)) - Number(Boolean(a.cand.syncedLyrics));
  });

  // 같은 가사가 여러 레코드(아티스트 표기·앨범만 다름)로 등록된 경우 점수가 가장 높은 하나만 남김
  const seenLyrics = new Set();
  return scored.filter(({ cand }) => {
    const key = getLyricsDedupeKey(cand);
    if (seenLyrics.has(key)) return false;
    seenLyrics.add(key);
    return true;
  });
}

/** 가사 본문 기준 중복 판별 키 (공백 차이는 무시) */
export function getLyricsDedupeKey(cand) {
  return getCandidateLyrics(cand).replace(/\s+/g, ' ').trim();
}

// ─────────────────────────────────────────────
// LRCLIB 클라이언트
// ─────────────────────────────────────────────

const RESPONSE_CACHE = new Map();
const RESPONSE_CACHE_LIMIT = 80;

function buildUrl(path, params) {
  const qs = Object.entries(params)
    .filter(([, v]) => v != null && String(v).trim() !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v).trim())}`)
    .join('&');
  return `${LRCLIB_BASE}/${path}${qs ? `?${qs}` : ''}`;
}

async function lrclibFetch(path, params, signal, fresh = false) {
  const url = buildUrl(path, params);
  if (!fresh && RESPONSE_CACHE.has(url)) return RESPONSE_CACHE.get(url);

  const res = await fetch(url, { signal });
  if (res.status === 404) {
    RESPONSE_CACHE.set(url, null);
    return null;
  }
  if (!res.ok) throw new Error(`LRCLIB ${res.status}`);
  const data = await res.json();

  if (RESPONSE_CACHE.size >= RESPONSE_CACHE_LIMIT) {
    RESPONSE_CACHE.delete(RESPONSE_CACHE.keys().next().value);
  }
  RESPONSE_CACHE.set(url, data);
  return data;
}

const FETCH_FAILED = Symbol('lrclib-fetch-failed');

/** 실패해도 전체 검색이 깨지지 않도록 감싼 호출 (Abort는 그대로 전파, 실패 시 FETCH_FAILED 반환) */
async function safeFetch(path, params, signal, fresh = false) {
  try {
    return await lrclibFetch(path, params, signal, fresh);
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    console.warn('[lyricsSearch]', path, err);
    return FETCH_FAILED;
  }
}

/**
 * 제목/아티스트로 LRCLIB 후보를 수집 (정렬 전 원본 목록)
 * - 필드 검색(track_name + artist_name), 키워드 검색(q), 정확 조회(get)를 병렬로 수행
 * 모든 요청이 실패하면(네트워크 오류, 429 등) 에러를 던진다.
 * @param {{ title?: string, artist?: string }} query
 * @param {{ signal?: AbortSignal, broad?: boolean, fresh?: boolean }} options
 *   broad: 아티스트가 원곡과 다른 커버곡 대비 제목 단독 검색도 추가 (수동 검색용)
 *   fresh: 메모리 응답 캐시를 건너뛰고 새로 조회 (다시 찾기용)
 */
export async function searchLyricCandidates({ title = '', artist = '' }, { signal, broad = false, fresh = false } = {}) {
  const t = title.trim();
  const a = artist.trim();
  if (!t && !a) return [];

  const requests = [];
  if (t) {
    requests.push(safeFetch('search', { track_name: t, artist_name: a }, signal, fresh));
    requests.push(safeFetch('search', { q: `${t} ${a}`.trim() }, signal, fresh));
    if (a) requests.push(safeFetch('get', { track_name: t, artist_name: a }, signal, fresh));
    // 커버/리메이크처럼 아티스트가 원곡과 다른 경우를 위해 제목만으로도 검색 (정렬에서 아티스트 일치가 우선)
    if (a && broad) requests.push(safeFetch('search', { track_name: t }, signal, fresh));
  } else {
    requests.push(safeFetch('search', { q: a }, signal, fresh));
  }

  const results = await Promise.all(requests);
  if (results.every((r) => r === FETCH_FAILED)) {
    throw new Error('가사 서버에 연결하지 못했습니다.');
  }
  const merged = [];
  // 정확 조회(get) 결과를 맨 앞에 둔다
  for (const r of results) {
    if (r === FETCH_FAILED) continue;
    if (Array.isArray(r)) merged.push(...r);
    else if (r && typeof r === 'object') merged.unshift(r);
  }
  return merged;
}

/**
 * 자동 매칭: 원곡 정보로 가장 적합한 가사 하나를 찾는다.
 * @param {{ title: string, artist?: string, duration?: number }} track
 * @returns {Promise<{ lyrics: string, isFallback: boolean, score: number } | null>}
 */
export async function findBestLyrics(track, { signal, fresh = false } = {}) {
  const target = { title: track.title, artist: track.artist, duration: track.duration };
  const query = buildSearchTarget(track.title, track.artist);

  let ranked = rankCandidates(await searchLyricCandidates(query, { signal, fresh }), target)
    .filter((r) => r.score >= MATCH_THRESHOLD);

  // 아티스트 없이 정제된 제목만으로 재검색
  if (ranked.length === 0 && query.title) {
    const fallback = await safeFetch('search', { q: query.title }, signal, fresh);
    if (Array.isArray(fallback)) {
      ranked = rankCandidates(fallback, target).filter((r) => r.score >= FALLBACK_MATCH_THRESHOLD);
    }
  }

  if (ranked.length === 0) return null;
  const best = ranked[0];
  const isExact = best.score >= EXACT_MATCH_THRESHOLD && Boolean(best.cand.syncedLyrics);
  return { lyrics: getCandidateLyrics(best.cand), isFallback: !isExact, score: best.score };
}
