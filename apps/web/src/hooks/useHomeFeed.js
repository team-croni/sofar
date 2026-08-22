import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../contexts/AuthContext';

function formatArtworkUrl(url) {
  if (!url) return null;
  return url.replace('/100x100bb.jpg', '/600x600bb.jpg').replace('/100x100', '/600x600');
}

/**
 * 백엔드 콜드 스타트(Cold Start) 대응 및 네트워크 재시도 헬퍼 함수
 * @param {string} url 
 * @param {RequestInit} [options] 
 * @param {number} [timeoutMs=15000] - 기본 타임아웃 15초 (슬립 모드 기동 대기)
 * @param {number} [maxRetries=1] - 실패 시 재시도 횟수
 */
async function fetchJsonWithRetry(url, options = {}, timeoutMs = 15000, maxRetries = 1) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          return json.data;
        }
      }
    } catch (err) {
      clearTimeout(timeoutId);
      if (attempt < maxRetries) {
        // 백엔드가 깨어나는 중일 수 있으므로 2초 후 재시도
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }
      console.warn(`[useHomeFeed] Fetch failed for ${url} (attempt ${attempt + 1}/${maxRetries + 1}):`, err.message);
    }
  }
  return [];
}

// 섹션 1: 뜨고 있는 음악 (NestJS 백엔드 전용 수집)
async function fetchHotChart() {
  const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  return fetchJsonWithRetry(`${backendUrl}/api/chart/top?limit=20`, {}, 15000, 1);
}

// 섹션 2: 최신 실시간 인기 순위 (NestJS 백엔드 전용 수집)
async function fetchPopularRankings() {
  const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  return fetchJsonWithRetry(`${backendUrl}/api/chart/popular?limit=100`, {}, 15000, 1);
}

// Supabase DB / LocalStorage 공개 공유 플레이리스트 쿼리 (400 Bad Request 예방 및 커스텀 커버 우선 반영)
async function fetchPublicPlaylists() {
  let userPublicPlaylists = [];
  let sharedIds = [];
  let localPlaylistMap = new Map();
  let customCoversMap = {};
  let customAuthorsMap = {};
  let sessionUserName = null;
  
  try {
    const localShared = localStorage.getItem('sofar_shared_playlist_ids');
    if (localShared) sharedIds = JSON.parse(localShared);

    const localCovers = localStorage.getItem('sofar_playlist_covers');
    if (localCovers) customCoversMap = JSON.parse(localCovers);

    const localAuthors = localStorage.getItem('sofar_playlist_authors');
    if (localAuthors) customAuthorsMap = JSON.parse(localAuthors);

    const localPl = localStorage.getItem('sofar_playlists');
    if (localPl) {
      const parsedPl = JSON.parse(localPl);
      parsedPl.forEach(p => localPlaylistMap.set(p.id, p));
    }

    // 현재 세션 사용자 닉네임 탐색
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.includes('auth-token')) {
        const val = localStorage.getItem(key);
        if (val) {
          const parsed = JSON.parse(val);
          sessionUserName = parsed?.user?.user_metadata?.full_name 
            || parsed?.user?.user_metadata?.name 
            || parsed?.user?.email?.split('@')[0];
          if (sessionUserName) break;
        }
      }
    }
  } catch (e) {}

  if (supabase) {
    try {
      // 유저 공개 플레이리스트의 근본 표준 상태 컬럼인 is_public = true 조건으로 조회
      const { data, error } = await supabase
        .from('playlists')
        .select('id, title, created_at, is_public, cover_url, user_id, tracks(id, youtube_video_id, custom_title, custom_artist)')
        .eq('is_public', true)
        .limit(10);
      
      if (error) {
        console.warn('Public playlists fetch error:', error.message);
      } else if (data && data.length > 0) {
        userPublicPlaylists = data
          .map((pl) => {
            const localObj = localPlaylistMap.get(pl.id);
            const cover = customCoversMap[pl.id] || localObj?.cover_url || localObj?.cover || pl.cover_url || null;
            const author = customAuthorsMap[pl.id] || localObj?.author || sessionUserName || '공유 리스너';
            return {
              id: pl.id,
              title: localObj?.title || pl.title,
              author: author,
              trackCount: (pl.tracks || []).length,
              tracks: (pl.tracks || []).map(t => ({
                ...t,
                searchQuery: `${t.custom_title} ${t.custom_artist}`
              })),
              cover: cover
            };
          }).filter(pl => pl.tracks.length > 0);
      }
    } catch (err) {
      console.warn('Public playlists fetch skipped:', err);
    }
  }

  try {
    const localPl = localStorage.getItem('sofar_playlists');
    const localTr = localStorage.getItem('sofar_tracks');
    if (localPl) {
      const parsedPl = JSON.parse(localPl);
      const parsedTr = localTr ? JSON.parse(localTr) : [];
      
      const localPublics = parsedPl.filter(p => p.is_public || sharedIds.includes(p.id)).map(pl => {
        const plTracks = parsedTr.filter(t => t.playlist_id === pl.id);
        const cover = customCoversMap[pl.id] || pl.cover_url || pl.cover || null;
        const author = customAuthorsMap[pl.id] || pl.author || pl.user_name || sessionUserName || '공유 리스너';
        return {
          id: pl.id,
          title: pl.title,
          author: author,
          trackCount: plTracks.length,
          tracks: plTracks,
          cover: cover
        };
      }).filter(pl => pl.tracks.length > 0);

      // 로컬 수정 썸네일 정보 우선 병합
      userPublicPlaylists = [...localPublics, ...userPublicPlaylists];
    }
  } catch (err) {
    console.warn('Local public playlists fetch error:', err);
  }

  if (userPublicPlaylists.length > 0) {
    const uniqueMap = new Map();
    userPublicPlaylists.forEach(pl => {
      if (!uniqueMap.has(pl.id)) {
        uniqueMap.set(pl.id, pl);
      } else {
        const existing = uniqueMap.get(pl.id);
        const resolvedCover = pl.cover || existing.cover || null;
        uniqueMap.set(pl.id, {
          ...pl,
          cover: resolvedCover
        });
      }
    });
    return Array.from(uniqueMap.values()).slice(0, 6);
  }

  // 공유 탭은 실제 공개된 사용자 플레이리스트만 노출한다.
  return [];
}

// 섹션 3: 테마별/카테고리별/장르별 큐레이션 플레이리스트 (NestJS 백엔드 수집)
async function fetchCategoryPlaylists() {
  const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  return fetchJsonWithRetry(`${backendUrl}/api/chart/categories`, {}, 15000, 1);
}

// 섹션 4: 비상업 단계의 한국 테마 후보 큐레이션 (NestJS 백엔드 수집)
async function fetchYoutubeCuratedPlaylists() {
  const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  return fetchJsonWithRetry(`${backendUrl}/api/chart/theme-candidates`, {}, 15000, 1);
}

const HOME_TOP_CACHE_KEY = 'sofar_home_top_feed_cache_v2';
const HOME_POPULAR_CACHE_KEY = 'sofar_home_popular_feed_cache_v2';

/**
 * sessionStorage 및 localStorage를 아우르는 다계층 지속성 캐시 조회
 * 1) sessionStorage 확인 (최근 세션)
 * 2) localStorage 확인 (오랜만에 재방문한 사용자용 Fallback - 7일 이내 데이터)
 */
function getPersistentCache(key) {
  try {
    // 1. SessionStorage 우선 검사 (30분 이내)
    const sessionRaw = sessionStorage.getItem(key);
    if (sessionRaw) {
      const parsed = JSON.parse(sessionRaw);
      if (parsed && Date.now() - parsed.timestamp < 1000 * 60 * 30) {
        return parsed.data;
      }
    }

    // 2. LocalStorage 영구 Fallback 검사 (7일 이내)
    const localRaw = localStorage.getItem(key);
    if (localRaw) {
      const parsed = JSON.parse(localRaw);
      if (parsed && parsed.data && Date.now() - parsed.timestamp < 1000 * 60 * 60 * 24 * 7) {
        return parsed.data;
      }
    }
  } catch (e) {}
  return undefined;
}

/**
 * sessionStorage 및 localStorage에 동시 저장하여 브라우저 재실행 시에도 데이터 즉시 복원
 */
function setPersistentCache(key, data) {
  try {
    const payload = JSON.stringify({
      timestamp: Date.now(),
      data
    });
    sessionStorage.setItem(key, payload);
    localStorage.setItem(key, payload);
  } catch (e) {}
}

export function useHomeFeed() {
  // 1) 뜨고 있는 음악 + 공개 공유 플레이리스트 + 장르/알고리즘 큐레이션
  const topFeedQuery = useQuery({
    queryKey: ['home-top-feed'],
    initialData: () => getPersistentCache(HOME_TOP_CACHE_KEY),
    queryFn: async () => {
      const [hotChartData, publicPls, catPlaylists, ytPlaylists] = await Promise.all([
        fetchHotChart(),
        fetchPublicPlaylists(),
        fetchCategoryPlaylists(),
        fetchYoutubeCuratedPlaylists(),
      ]);

      const mergedCategories = [...(catPlaylists || []), ...(ytPlaylists || [])];
      
      // 서버에서 정상적으로 데이터를 가져온 경우
      if (hotChartData && hotChartData.length > 0) {
        const result = {
          topTracks: hotChartData,
          sharedPlaylists: publicPls || [],
          categoryPlaylists: mergedCategories,
        };
        setPersistentCache(HOME_TOP_CACHE_KEY, result);
        return result;
      }

      // 서버 요청이 실패했으나 기존 캐시가 있는 경우 기존 캐시 보존
      const cached = getPersistentCache(HOME_TOP_CACHE_KEY);
      if (cached && cached.topTracks?.length > 0) {
        return {
          ...cached,
          sharedPlaylists: publicPls?.length > 0 ? publicPls : cached.sharedPlaylists,
          categoryPlaylists: mergedCategories.length > 0 ? mergedCategories : cached.categoryPlaylists,
        };
      }

      return {
        topTracks: hotChartData || [],
        sharedPlaylists: publicPls || [],
        categoryPlaylists: mergedCategories,
      };
    },
    staleTime: 1000 * 60 * 5, // 5분 동안 캐시된 피드 즉시 재사용
    gcTime: 1000 * 60 * 60 * 24, // 24시간 가비지 컬렉션 유예
    retry: 2, // 실패 시 2회 자동 재시도 (Cold Start 대기)
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  });

  // 2) 실시간 인기 순위 (주기적 갱신 유지: 3분 간격 폴링)
  const popularFeedQuery = useQuery({
    queryKey: ['home-popular-feed'],
    initialData: () => getPersistentCache(HOME_POPULAR_CACHE_KEY),
    queryFn: async () => {
      const popularRankingData = await fetchPopularRankings();
      if (popularRankingData && popularRankingData.length > 0) {
        setPersistentCache(HOME_POPULAR_CACHE_KEY, popularRankingData);
        return popularRankingData;
      }

      // 서버 실패 시 캐시된 인기 순위 fallback 유지
      const cached = getPersistentCache(HOME_POPULAR_CACHE_KEY);
      if (cached && Array.isArray(cached) && cached.length > 0) {
        return cached;
      }

      return popularRankingData || [];
    },
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 60 * 24,
    retry: 2,
    retryDelay: 3000,
    refetchInterval: 1000 * 60 * 3, // 3분마다 자동 갱신 (sofar 감상 횟수 반영)
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  });

  return {
    topTracks: topFeedQuery.data?.topTracks || [],
    statTracks: popularFeedQuery.data || [],
    sharedPlaylists: topFeedQuery.data?.sharedPlaylists || [],
    categoryPlaylists: topFeedQuery.data?.categoryPlaylists || [],
    isLoading: (!topFeedQuery.data && topFeedQuery.isLoading) || (!popularFeedQuery.data && popularFeedQuery.isLoading),
  };
}
