import { useState, useEffect, useCallback, useRef } from 'react';
import { parseLRC } from '../utils/lrcParser';
import { supabase } from '../contexts/AuthContext';
import { thumbnailCache } from '../utils/thumbnailCache';
import { getCleanTitle, getCleanArtist, findBestLyrics, getLyricsDedupeKey } from '../utils/lyricsSearch';

const CLIENT_LYRICS_CACHE = new Map();
const LYRICS_SESSION_KEY_PREFIX = 'sofar_lyrics_cache_';

function getClientCacheKey(title, artist) {
  return `${getCleanTitle(title)}___${getCleanArtist(artist || '')}`.toLowerCase();
}

function getClientLyricCache(title, artist) {
  if (!title) return null;
  const key = getClientCacheKey(title, artist);
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
  const key = getClientCacheKey(title, artist);
  CLIENT_LYRICS_CACHE.set(key, data);
  try {
    sessionStorage.setItem(`${LYRICS_SESSION_KEY_PREFIX}${key}`, JSON.stringify(data));
  } catch (e) {}
}

// ─────────────────────────────────────────────
// Supabase 공용 가사 캐시 (lyric_caches)
// raw_lrc 앞에 [artwork:..], [is_fallback:true] 메타 줄을 붙여 저장한다.
// ─────────────────────────────────────────────

async function readServerCache(title, artist) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('lyric_caches')
      .select('raw_lrc')
      .eq('artist', artist)
      .eq('title', title)
      .maybeSingle();
    if (error || !data?.raw_lrc) return null;

    let lrc = data.raw_lrc;
    let isFallback = false;
    let artwork = null;
    // 메타 줄 순서와 상관없이 앞에서부터 벗겨낸다
    for (;;) {
      const artworkMatch = lrc.match(/^\[artwork:(https?:\/\/[^\]]+)\]\n?/);
      if (artworkMatch) {
        artwork = artworkMatch[1];
        lrc = lrc.slice(artworkMatch[0].length);
        continue;
      }
      const fallbackMatch = lrc.match(/^\[is_fallback:true\]\n?/);
      if (fallbackMatch) {
        isFallback = true;
        lrc = lrc.slice(fallbackMatch[0].length);
        continue;
      }
      break;
    }
    return { lyrics: lrc, isFallback, artwork };
  } catch (err) {
    console.warn('Supabase Lyric Cache Query Warn:', err);
    return null;
  }
}

async function writeServerCache(title, artist, lyrics, isFallback, artwork) {
  if (!supabase) return;
  let raw = lyrics;
  if (isFallback) raw = `[is_fallback:true]\n${raw}`;
  if (artwork) raw = `[artwork:${artwork}]\n${raw}`;
  try {
    await supabase.from('lyric_caches').delete().eq('artist', artist).eq('title', title);
    await supabase.from('lyric_caches').insert({ artist, title, raw_lrc: raw });
  } catch (err) {
    console.warn('Supabase Lyric Cache Update Error:', err);
  }
}

/**
 * 곡 가사를 가져오는 훅
 * 조회 순서: 세션 캐시 → Supabase 공용 캐시 → LRCLIB
 * (공용 캐시가 '정확도 낮음' 상태면 먼저 보여주고 뒤에서 LRCLIB로 더 나은 결과를 찾는다)
 *
 * @param {string} title
 * @param {string} artist
 * @param {string} customLyrics - 사용자가 직접 지정한 가사 (있으면 최우선)
 * @param {number} duration - 곡 길이(초). 후보 적합도 계산에 사용
 * @returns {{ lyrics, rawLrc, loading, error, isFallback, isRematching, rematchLyrics }}
 *   rematchLyrics(): 캐시를 건너뛰고 가사를 다시 찾는다.
 *     결과: 'updated' | 'confirmed' | 'same' | 'notfound' | 'error' | 'skipped'
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
  const [isRematching, setIsRematching] = useState(false);

  // 다시 찾기(비동기)에서 최신 값을 참조하기 위한 ref
  const latestRef = useRef({});
  latestRef.current = { title, artist, customLyrics, duration, rawLrc, isFallback };
  const rematchAbortRef = useRef(null);

  const applyLyrics = useCallback((text, fallback) => {
    setRawLrc(text);
    setLyrics(parseLRC(text));
    setIsFallback(fallback);
    setError(null);
  }, []);

  useEffect(() => {
    let active = true;
    const abortController = new AbortController();

    // 곡이 바뀌면 진행 중인 다시 찾기는 취소
    rematchAbortRef.current?.abort();
    setIsRematching(false);

    if (customLyrics) {
      applyLyrics(customLyrics, false);
      setLoading(false);
      return;
    }

    if (!title) {
      applyLyrics('', false);
      setLoading(false);
      return;
    }

    const artistName = artist?.trim() || '';
    const titleName = title.trim();

    const cached = getClientLyricCache(titleName, artistName);
    if (cached) {
      applyLyrics(cached.rawLrc, cached.isFallback || false);
      setLoading(false);
      return;
    }

    setLoading(true);
    applyLyrics('', false);

    const fetchLyrics = async () => {
      try {
        const server = await readServerCache(titleName, artistName);
        if (!active) return;

        let bestLyrics = server?.lyrics || '';
        let bestIsFallback = server?.isFallback || false;
        const artwork = server?.artwork || thumbnailCache.get(artistName, titleName);
        if (server?.artwork) thumbnailCache.set(artistName, titleName, server.artwork);

        // 공용 캐시가 없거나 정확도 낮은 결과면 LRCLIB 조회
        if (!bestLyrics || bestIsFallback) {
          if (bestLyrics) {
            // 정확도 낮은 캐시라도 먼저 보여준다
            applyLyrics(bestLyrics, true);
            setLoading(false);
          }

          const best = await findBestLyrics(
            { title: titleName, artist: artistName, duration },
            { signal: abortController.signal }
          ).catch((fetchErr) => {
            if (fetchErr?.name === 'AbortError') throw fetchErr;
            console.warn('LRCLIB lookup failed:', fetchErr);
            return null;
          });
          if (!active) return;

          // 기존 캐시가 없었거나, 더 정확한 결과를 찾았을 때만 교체
          if (best && (!bestLyrics || !best.isFallback)) {
            bestLyrics = best.lyrics;
            bestIsFallback = best.isFallback;
            writeServerCache(titleName, artistName, bestLyrics, bestIsFallback, artwork);
          }
        }

        if (!active) return;
        if (!bestLyrics) throw new Error('가사를 찾을 수 없습니다.');

        applyLyrics(bestLyrics, bestIsFallback);
        setClientLyricCache(titleName, artistName, { rawLrc: bestLyrics, isFallback: bestIsFallback });
      } catch (err) {
        if (!active || err?.name === 'AbortError') return;
        console.error('Lyrics Fetch Error:', err);
        applyLyrics('', false); // applyLyrics가 error를 초기화하므로 먼저 호출
        setError(err.message || '가사 로드 중 오류가 발생했습니다.');
      } finally {
        if (active) setLoading(false);
      }
    };

    const timer = setTimeout(fetchLyrics, 120);

    return () => {
      active = false;
      abortController.abort();
      clearTimeout(timer);
    };
    // duration은 곡 단위 메타데이터라 의존성에서 제외 (값이 늦게 채워져도 재조회하지 않음)
  }, [title, artist, customLyrics, applyLyrics]);

  /**
   * 가사 다시 찾기 — 캐시를 건너뛰고 LRCLIB에서 새로 찾는다.
   * 지금 보이는 가사는 유지한 채 진행하고, 더 나은 결과가 있을 때만 교체한다.
   */
  const rematchLyrics = useCallback(async () => {
    const { title: t, artist: a, customLyrics: custom, duration: dur } = latestRef.current;
    if (!t || custom) return 'skipped';

    rematchAbortRef.current?.abort();
    const controller = new AbortController();
    rematchAbortRef.current = controller;
    setIsRematching(true);

    const titleName = t.trim();
    const artistName = a?.trim() || '';

    try {
      const best = await findBestLyrics(
        { title: titleName, artist: artistName, duration: dur },
        { signal: controller.signal, fresh: true }
      );
      if (controller.signal.aborted) return 'skipped';
      if (!best) return 'notfound';

      const { rawLrc: current, isFallback: currentIsFallback } = latestRef.current;
      const isSame = Boolean(current) && getLyricsDedupeKey({ syncedLyrics: current }) === getLyricsDedupeKey({ syncedLyrics: best.lyrics });

      // 이미 정확히 매칭된 가사는 유지 (LRCLIB에는 같은 곡이 문구만 조금 다른 레코드로 여럿 있어 바꿔봐야 의미가 없음)
      // 교체는 가사가 없었거나 정확도 낮은 가사였을 때만
      const shouldReplace = !isSame && (!current || currentIsFallback);

      if (!shouldReplace) {
        if (isSame && currentIsFallback && !best.isFallback) {
          // 같은 가사가 이번에 정확한 매칭으로 확인됨 → 상태만 갱신
          setIsFallback(false);
          setClientLyricCache(titleName, artistName, { rawLrc: current, isFallback: false });
          writeServerCache(titleName, artistName, current, false, thumbnailCache.get(artistName, titleName));
          return 'confirmed';
        }
        return 'same';
      }

      applyLyrics(best.lyrics, best.isFallback);
      setClientLyricCache(titleName, artistName, { rawLrc: best.lyrics, isFallback: best.isFallback });
      writeServerCache(titleName, artistName, best.lyrics, best.isFallback, thumbnailCache.get(artistName, titleName));
      return 'updated';
    } catch (err) {
      if (err?.name === 'AbortError') return 'skipped';
      console.warn('Lyrics rematch failed:', err);
      return 'error';
    } finally {
      if (rematchAbortRef.current === controller) {
        rematchAbortRef.current = null;
        setIsRematching(false);
      }
    }
  }, [applyLyrics]);

  return { lyrics, rawLrc, loading, error, isFallback, isRematching, rematchLyrics };
}
