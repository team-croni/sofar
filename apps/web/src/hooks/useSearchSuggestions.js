import { useEffect, useMemo, useState } from 'react';
import { searchDomesticTracks, searchItunesTracks } from '../utils/itunes';
import { formatArtistName } from '../utils/trackUtils';

const TRENDING_KEYWORDS_CACHE_KEY = 'sofar_trending_keywords_cache';
const TRENDING_CACHE_TTL = 1000 * 60 * 10;
const MAX_RECENT = 3;
const MAX_TRENDING = 2;
const MAX_ARTISTS = 2;
const MAX_TRACKS = 5;
const MUSIC_FETCH_LIMIT = 12;
const DEBOUNCE_MS = 120;

// 동일 검색어 재요청 방지를 위한 모듈 레벨 캐시 (세션 동안 유지)
const musicSuggestCache = new Map();

// 인기 검색어: SearchLandingView가 sessionStorage에 저장한 캐시를 우선 사용, 없으면 1회 조회
let trendingKeywordsPromise = null;

function readTrendingCache() {
  try {
    const raw = sessionStorage.getItem(TRENDING_KEYWORDS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Date.now() - parsed.timestamp < TRENDING_CACHE_TTL && Array.isArray(parsed.data)) {
      return parsed.data;
    }
  } catch (e) {}
  return null;
}

function loadTrendingKeywords() {
  const cached = readTrendingCache();
  if (cached) return Promise.resolve(cached);
  if (trendingKeywordsPromise) return trendingKeywordsPromise;

  const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  trendingKeywordsPromise = fetch(`${backendUrl}/api/search/trending?limit=20`)
    .then((res) => (res.ok ? res.json() : null))
    .then((json) => (json?.success && Array.isArray(json.data) ? json.data : []))
    .catch(() => [])
    .finally(() => {
      setTimeout(() => { trendingKeywordsPromise = null; }, TRENDING_CACHE_TTL);
    });
  return trendingKeywordsPromise;
}

/** 국내 음원 DB 우선, 결과가 없으면 iTunes(해외 음원)로 폴백 */
async function fetchMusicSuggestions(q) {
  const domestic = await searchDomesticTracks(q, MUSIC_FETCH_LIMIT);
  if (domestic.length > 0) return domestic;
  return searchItunesTracks(q, MUSIC_FETCH_LIMIT);
}

const normalize = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Bugs 아티스트 대표 이미지 URL (artistId만으로 경로가 결정됨: /{크기}/{floor(id/100)}/{id}.jpg)
 * 국내 음원 검색 결과에만 Bugs artistId가 있으므로 그 외(iTunes 등)는 null
 */
function getBugsArtistImage(track, size = 130) {
  if (track?.source !== 'domestic-search') return null;
  const id = Number(track.artist_id);
  if (!Number.isInteger(id) || id <= 0) return null;
  return `https://image.bugsm.co.kr/artist/images/${size}/${Math.floor(id / 100)}/${id}.jpg`;
}

/** 접두 일치를 우선, 그 다음 부분 일치 순으로 정렬해 반환 */
function matchByQuery(list, q) {
  const prefix = [];
  const contains = [];
  for (const item of list) {
    const n = normalize(item);
    if (n === q) continue; // 입력어와 완전히 같은 항목은 제안할 의미가 없음
    if (n.startsWith(q)) prefix.push(item);
    else if (n.includes(q)) contains.push(item);
  }
  return [...prefix, ...contains];
}

const trackMatches = (t, q) =>
  normalize(t.custom_title).includes(q) || normalize(t.custom_artist).includes(q);

/**
 * 검색 자동완성 제안 목록
 * - 키워드: 최근 검색어, 인기 검색어
 * - 음원: 국내 음원 DB(폴백 iTunes) 기반 아티스트 / 곡
 *
 * 각 항목의 `term`은 선택 시 실제로 검색할 문자열입니다.
 * @returns {{ items: Array<{ type: 'recent'|'trending'|'artist'|'track', term: string, label: string, sub?: string, thumbnail?: string }> }}
 */
export default function useSearchSuggestions(query, { recentSearches = [], enabled = true } = {}) {
  const [trendingKeywords, setTrendingKeywords] = useState(() => readTrendingCache() || []);
  const [music, setMusic] = useState({ query: '', tracks: [] });

  const q = normalize(query);

  // 인기 검색어는 자동완성이 처음 활성화될 때 한 번만 로드
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadTrendingKeywords().then((data) => {
      if (!cancelled && data.length > 0) setTrendingKeywords(data);
    });
    return () => { cancelled = true; };
  }, [enabled]);

  // 음원 제안: 디바운스 + 캐시 + 늦게 도착한 응답 무시
  useEffect(() => {
    if (!enabled || !q) return;

    const cached = musicSuggestCache.get(q);
    if (cached) {
      setMusic({ query: q, tracks: cached });
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      let tracks = [];
      try {
        tracks = await fetchMusicSuggestions(q);
        musicSuggestCache.set(q, tracks);
      } catch (e) {}
      // 실패해도 응답 완료로 표시해 로딩 행이 남지 않도록 함
      if (!cancelled) setMusic({ query: q, tracks });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, enabled]);

  const items = useMemo(() => {
    if (!enabled || !q) return [];

    const seen = new Set();
    const result = [];
    // 키워드 제안은 입력어와 똑같으면 의미가 없지만, 아티스트는 입력어와 같아도 바로가기로 유용하므로 허용
    const add = (item) => {
      const key = normalize(item.term);
      if (!key || seen.has(key)) return false;
      if (key === q && item.type !== 'artist') return false;
      seen.add(key);
      result.push(item);
      return true;
    };

    // 1) 키워드 그룹
    matchByQuery(recentSearches, q)
      .slice(0, MAX_RECENT)
      .forEach((text) => add({ type: 'recent', term: text, label: text }));

    let trendingCount = 0;
    for (const text of matchByQuery(trendingKeywords.map((k) => k.keyword).filter(Boolean), q)) {
      if (trendingCount >= MAX_TRENDING) break;
      if (add({ type: 'trending', term: text, label: text })) trendingCount += 1;
    }

    // 2) 음원 그룹. 새 응답을 기다리는 동안에는 이전 결과 중 여전히 일치하는 곡만 유지해 깜빡임 방지
    const tracks = music.query === q
      ? music.tracks
      : music.tracks.filter((t) => trackMatches(t, q));

    // 아티스트: 이름이 입력어와 일치하는 경우만 (피처링 곡 등으로 엉뚱한 아티스트가 뜨지 않도록)
    let artistCount = 0;
    for (const t of tracks) {
      if (artistCount >= MAX_ARTISTS) break;
      const raw = (t.custom_artist || '').trim();
      if (!raw || !normalize(raw).includes(q)) continue;
      // "DAY6 (데이식스)"처럼 병기된 이름은 각 표기 모두로 중복 검사 (인기 검색어 "DAY6"와 겹치지 않도록)
      const aliases = raw.split(/[()]/).map(normalize).filter(Boolean);
      if (aliases.some((a) => seen.has(a))) continue;
      const name = formatArtistName(raw) || raw;
      // 보조 문구: 해당 아티스트의 대표곡 (여러 곡이면 "외")
      // 썸네일: 아티스트 대표 이미지 (없거나 로드 실패 시 아이콘으로 대체)
      const artistTrackCount = tracks.filter((x) => (x.custom_artist || '').trim() === raw).length;
      const repTitle = (t.custom_title || '').trim();
      const sub = repTitle ? `${repTitle}${artistTrackCount > 1 ? ' 외' : ''}` : undefined;
      if (add({ type: 'artist', term: name, label: name, sub, thumbnail: getBugsArtistImage(t) })) {
        aliases.forEach((a) => seen.add(a));
        artistCount += 1;
      }
    }

    let trackCount = 0;
    for (const t of tracks) {
      if (trackCount >= MAX_TRACKS) break;
      const title = (t.custom_title || '').trim();
      if (!title) continue;
      const artist = formatArtistName(t.custom_artist || '') || '';
      if (add({
        type: 'track',
        term: `${artist} ${title}`.trim(),
        label: title,
        sub: artist,
        thumbnail: t.thumbnail || t.artwork,
      })) {
        trackCount += 1;
      }
    }

    return result;
  }, [enabled, q, recentSearches, trendingKeywords, music]);

  // 현재 입력에 대한 음원 응답을 기다리는 중이고, 대신 보여줄 음원 항목도 없으면 로딩 상태
  // (드롭다운을 즉시 띄워 자동완성이 동작 중임을 알리기 위함)
  const musicLoading =
    enabled && Boolean(q) && music.query !== q &&
    !items.some((it) => it.type === 'artist' || it.type === 'track');

  return { items, musicLoading };
}
