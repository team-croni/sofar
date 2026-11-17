import { useState, useEffect, useCallback } from 'react';
import { parseLRC } from '../utils/lrcParser';
import { supabase } from '../contexts/AuthContext';
import { thumbnailCache } from '../utils/thumbnailCache';
import { getCleanTitle, getCleanArtist, findBestLyrics } from '../utils/lyricsSearch';

const CLIENT_LYRICS_CACHE = new Map();
const LYRICS_SESSION_KEY_PREFIX = 'sofar_lyrics_cache_';

function getClientLyricCache(title, artist) {
  if (!title) return null;
  const key = `${getCleanTitle(title)}___${getCleanArtist(artist || '')}`.toLowerCase();
  if (CLIENT_LYRICS_CACHE.has(key)) {
    return CLIENT_LYRICS_CACHE.get(key);
  }
  try {
    const raw = sessionStorage.getItem(`${LYRICS_SESSION_KEY_PREFIX}${key}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      CLIENT_LYRICS_CACHE.set(key, parsed);
      return parsed;
    }
  } catch (e) {}
  return null;
}

function setClientLyricCache(title, artist, data) {
  if (!title) return;
  const key = `${getCleanTitle(title)}___${getCleanArtist(artist || '')}`.toLowerCase();
  CLIENT_LYRICS_CACHE.set(key, data);
  try {
    sessionStorage.setItem(`${LYRICS_SESSION_KEY_PREFIX}${key}`, JSON.stringify(data));
  } catch (e) {}
}

/**
 * LRCLIB API를 이용해 가사를 가져오고 영구 캐싱 및 스마트 백그라운드 재검증(Stale-While-Revalidate)을 적용하는 커스텀 훅
 * @param {string} title 
 * @param {string} artist 
 * @param {string} customLyrics - 사용자가 직접 입력한 가사 (있을 경우 최우선)
 * @param {number} duration - 곡 길이(초). 후보 적합도 계산에 사용
 */
export function useLyrics(title, artist, customLyrics = null, duration = 0) {
  const initialCache = (!customLyrics && title) ? getClientLyricCache(title, artist) : null;
  const [lyrics, setLyrics] = useState(() => {
    if (customLyrics) return parseLRC(customLyrics);
    if (initialCache?.rawLrc) return parseLRC(initialCache.rawLrc);
    return [];
  });
  const [rawLrc, setRawLrc] = useState(() => customLyrics || initialCache?.rawLrc || '');
  const [loading, setLoading] = useState(() => Boolean(title && !customLyrics && !initialCache));
  const [error, setError] = useState(null);
  const [isFallback, setIsFallback] = useState(() => initialCache?.isFallback || false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const refetchLyrics = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  useEffect(() => {
    let active = true; // 이전 비동기 요청 완료 처리 방지용 플래그
    const abortController = new AbortController();

    // 1. 수동 가사가 제공된 경우 파싱하여 즉시 적용
    if (customLyrics) {
      setLyrics(parseLRC(customLyrics));
      setRawLrc(customLyrics);
      setLoading(false);
      setError(null);
      setIsFallback(false);
      return;
    }

    // 곡 정보가 없는 경우 초기화
    if (!title) {
      setLyrics([]);
      setRawLrc('');
      setLoading(false);
      setError(null);
      setIsFallback(false);
      return;
    }

    const artistName = artist?.trim() || '';
    const titleName = title.trim();
    const isForceRefresh = refreshTrigger > 0;

    const cached = !isForceRefresh ? getClientLyricCache(titleName, artistName) : null;
    if (cached) {
      setLyrics(parseLRC(cached.rawLrc));
      setRawLrc(cached.rawLrc);
      setIsFallback(cached.isFallback || false);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    if (!isForceRefresh) {
      setLyrics([]);
      setRawLrc('');
    }
    setError(null);

    const fetchLyrics = async () => {
      setLoading(true);
      setError(null);

      try {
        let bestLyrics = '';
        let isFallbackMatched = false;
        let cachedArtwork = null;

        // [1단계: Supabase 공용 DB 캐시 조회 (강제 새로고침 시 스킵)]
        if (supabase && !isForceRefresh) {
          try {
            const { data: serverCached, error: serverErr } = await supabase
              .from('lyric_caches')
              .select('raw_lrc')
              .eq('artist', artistName)
              .eq('title', titleName)
              .maybeSingle();

            if (!serverErr && serverCached && serverCached.raw_lrc) {
              let lrc = serverCached.raw_lrc;
              if (lrc.includes('[is_fallback:true]')) {
                isFallbackMatched = true;
                lrc = lrc.replace(/^\[is_fallback:true\]\n?/, '');
              }
              const artworkMatch = lrc.match(/^\[artwork:(https?:\/\/[^\]]+)\]/);
              if (artworkMatch) {
                cachedArtwork = artworkMatch[1];
                thumbnailCache.set(artistName, titleName, cachedArtwork);
                lrc = lrc.replace(/^\[artwork:[^\]]+\]\n?/, '');
              }
              bestLyrics = lrc;
            }
          } catch (dbErr) {
            console.warn('Supabase Lyric Cache Query Warn:', dbErr);
          }
        }

        if (!active) return;

        // 캐시에 존재하지 않거나, 이전 캐시가 임시/Fallback 매칭이거나, 강제 새로고침 요청인 경우 원본 API(LRCLIB) 라이브 조회
        const shouldQueryOrigin = !bestLyrics || isFallbackMatched || isForceRefresh;

        if (shouldQueryOrigin) {
          // 기존 캐시가 있었지만 임시/Fallback 상태였다면 사용자는 캐시된 가사를 먼저 볼 수 있도록 우선 적용 (Stale-While-Revalidate)
          if (bestLyrics && !isForceRefresh) {
            const parsedCached = parseLRC(bestLyrics);
            setRawLrc(bestLyrics);
            setLyrics(parsedCached);
            setIsFallback(true);
            setLoading(false); // 사용자에게는 빠른 화면 노출
          }

          let newBestLyrics = '';
          let isExactMatch = false;
          let newIsFallback = false;

          const best = await findBestLyrics(
            { title: titleName, artist: artistName, duration },
            { signal: abortController.signal }
          ).catch((fetchErr) => {
            // 원본 조회 실패 시에도 캐시된 가사가 있으면 그대로 유지
            if (fetchErr?.name === 'AbortError') throw fetchErr;
            console.warn('LRCLIB lookup failed:', fetchErr);
            return null;
          });

          if (!active) return;

          if (best) {
            newBestLyrics = best.lyrics;
            newIsFallback = best.isFallback;
            isExactMatch = !best.isFallback;
          }

          // 고품질 정밀 매칭을 새로 발견했거나, 기존 캐시가 없었던 경우/강제 새로고침 시 가사 업그레이드 및 DB 반영
          if (newBestLyrics && (isExactMatch || !bestLyrics || isForceRefresh)) {
            bestLyrics = newBestLyrics;
            isFallbackMatched = newIsFallback;

            if (supabase) {
              let lrcToSave = bestLyrics;
              if (isFallbackMatched) {
                lrcToSave = `[is_fallback:true]\n${lrcToSave}`;
              }
              const cachedArt = cachedArtwork || thumbnailCache.get(artistName, titleName);
              if (cachedArt) {
                lrcToSave = `[artwork:${cachedArt}]\n${lrcToSave}`;
              }

              try {
                await supabase.from('lyric_caches').delete().eq('artist', artistName).eq('title', titleName);
                await supabase.from('lyric_caches').insert({
                  artist: artistName,
                  title: titleName,
                  raw_lrc: lrcToSave
                });
              } catch (saveErr) {
                console.warn('Supabase Lyric Cache Update Error:', saveErr);
              }
            }
          }
        }

        if (!active) return;

        if (!bestLyrics) {
          throw new Error('가사를 찾을 수 없습니다.');
        }

        const parsed = parseLRC(bestLyrics);
        setRawLrc(bestLyrics);
        setLyrics(parsed);
        setIsFallback(isFallbackMatched);
        setClientLyricCache(titleName, artistName, { rawLrc: bestLyrics, isFallback: isFallbackMatched });
      } catch (err) {
        if (!active || err?.name === 'AbortError') return;
        console.error('Lyrics Fetch Error:', err);
        setError(err.message || '가사 로드 중 오류가 발생했습니다.');
        setLyrics([]);
        setRawLrc('');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    const timer = setTimeout(() => {
      fetchLyrics();
    }, 120);

    return () => {
      active = false;
      abortController.abort();
      clearTimeout(timer);
    };
    // duration은 곡 단위 메타데이터라 의존성에서 제외 (값이 늦게 채워져도 재조회하지 않음)
  }, [title, artist, customLyrics, refreshTrigger]);

  return { lyrics, rawLrc, loading, error, isFallback, refetchLyrics };
}

