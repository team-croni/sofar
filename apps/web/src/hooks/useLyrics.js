import { useState, useEffect, useCallback } from 'react';
import { parseLRC } from '../utils/lrcParser';
import { supabase } from '../contexts/AuthContext';
import { thumbnailCache } from '../utils/thumbnailCache';

/**
 * 곡 제목 정제 헬퍼 함수 (괄호 안의 Remake, Cover, Ver, Feat 등 수식어 및 대괄호 태그 제거)
 */
export function getCleanTitle(title) {
  if (!title) return '';
  let cleaned = title;

  // 1. 대괄호/특수 괄호 태그 제거 (예: [MV], [4K], 【MV】, [Official], [Audio], [가사] 등)
  cleaned = cleaned.replace(/[\[【〔][^\]】〕]*[\]】〕]/g, ' ');

  // 2. 비디오/수식어 관련 일반 괄호 제거
  cleaned = cleaned.replace(/\s*\([^)]*(?:MV|M\/V|Video|Audio|Official|Lyrics|가사|자막|Remake|Cover|Remaster|Version|Ver\.|Edit|Acoustic|Live|Feat|with|Prod|Session|Special|Clip|Performance|Visualizer|Teaser)[^)]*\)/gi, ' ');

  // 3. 언더스코어, 파이프, 대시 뒤의 수식어 제거
  cleaned = cleaned.replace(/\s*[\|_]\s*(?:MV|M\/V|Music\s+Video|Official|Audio|Video).*/gi, ' ');
  cleaned = cleaned.replace(/\s*-\s*(?:Remake|Cover|Remaster|Version|Ver\.|Edit|Acoustic|Live|Feat\.|Feat|with|MV|M\/V|Music\s+Video|Official\s+Video|Official\s+M\/V|Official\s+MV|Official\s+Audio|Official|Audio|Lyrics|가사|자막).*/gi, ' ');

  // 4. 단독 키워드 제거
  cleaned = cleaned.replace(/\b(?:MV|M\/V|Music\s+Video|Official\s+Video|Official\s+M\/V|Official\s+MV|Official\s+Audio|Official\s+Visualizer)\b/gi, ' ');

  // 5. 따옴표 및 특수기호 정리
  cleaned = cleaned.replace(/['"“”‘’`]/g, '');

  // 6. 다중 공백 정리
  return cleaned.replace(/\s+/g, ' ').trim();
}

/**
 * 아티스트명 정제 헬퍼 함수
 */
export function getCleanArtist(artist) {
  if (!artist) return '';
  let cleaned = artist;
  // 괄호 속 부가 정보 및 특수문자 정리
  cleaned = cleaned.replace(/\s*[\(\[][^)\]]*[\)\]]/g, ' ');
  cleaned = cleaned.replace(/['"“”‘’`]/g, '');
  return cleaned.replace(/\s+/g, ' ').trim();
}

/**
 * 문자열 비교용 정규화 (공백, 특수문자 제거, 소문자화, NFC 정규화)
 */
export function normalizeForCompare(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .trim();
}

/**
 * 두 문자열 간의 유사도 점수 (0.0 ~ 1.0)
 */
export function calculateTextSimilarity(a, b) {
  const normA = normalizeForCompare(a);
  const normB = normalizeForCompare(b);

  if (!normA || !normB) return 0;
  if (normA === normB) return 1.0;

  // 한쪽이 다른 쪽에 완전히 포함되어 있는 경우 (길이 비율 반영)
  if (normA.includes(normB) || normB.includes(normA)) {
    const minLen = Math.min(normA.length, normB.length);
    const maxLen = Math.max(normA.length, normB.length);
    return 0.7 + 0.3 * (minLen / maxLen);
  }

  // bigram (2글자 단위) 유사도 계산
  if (normA.length >= 2 && normB.length >= 2) {
    const getBigrams = (s) => {
      const set = new Set();
      for (let i = 0; i < s.length - 1; i++) {
        set.add(s.slice(i, i + 2));
      }
      return set;
    };
    const bgA = getBigrams(normA);
    const bgB = getBigrams(normB);
    let intersection = 0;
    for (const bg of bgA) {
      if (bgB.has(bg)) intersection++;
    }
    const union = bgA.size + bgB.size - intersection;
    return union > 0 ? intersection / union : 0;
  }

  return 0;
}

/**
 * 가사 후보의 적합도 점수 평가 (0.0 ~ 1.0+)
 * - 제목/아티스트 유사도가 기준 미달이거나 무관한 곡은 0점 반환하여 오매칭을 원천 차단
 */
export function evaluateLyricCandidate(candidate, targetTitle, targetArtist) {
  if (!candidate) return 0;
  const candLyrics = candidate.syncedLyrics || candidate.plainLyrics || '';
  if (!candLyrics.trim()) return 0;

  const candTitle = candidate.trackName || candidate.title || '';
  const candArtist = candidate.artistName || candidate.artist || '';

  const cleanTargetTitle = getCleanTitle(targetTitle);
  const cleanCandTitle = getCleanTitle(candTitle);

  const cleanTargetArtist = getCleanArtist(targetArtist);
  const cleanCandArtist = getCleanArtist(candArtist);

  const titleScore = calculateTextSimilarity(cleanTargetTitle, cleanCandTitle);
  const artistScore = calculateTextSimilarity(cleanTargetArtist, cleanCandArtist);

  // 1. 제목 유사도가 너무 낮으면 (0.45 미만) 즉시 탈락
  if (titleScore < 0.45) {
    return 0;
  }

  // 2. 원곡 아티스트가 확실히 있는데 후보 아티스트와 전혀 다르고 제목도 완전 일치(0.95)가 아니면 탈락
  const normTargetArtist = normalizeForCompare(cleanTargetArtist);
  if (normTargetArtist && artistScore < 0.3 && titleScore < 0.95) {
    return 0;
  }

  // 3. 언어 적합도 검증 (원곡 제목/아티스트에 한글이 포함된 곡인데 가사에 한글이 전혀 없는 경우)
  const isTargetKorean = /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(cleanTargetTitle) || /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(cleanTargetArtist);
  const candHasKorean = /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(candLyrics);
  if (isTargetKorean && !candHasKorean) {
    if (titleScore < 0.95 || (normTargetArtist && artistScore < 0.6)) {
      return 0;
    }
  }

  // 4. 점수 가중치 합산
  let baseScore;
  if (!normTargetArtist) {
    baseScore = titleScore;
  } else {
    baseScore = (titleScore * 0.65) + (artistScore * 0.35);
  }

  // 5. 싱크 가사 보너스 (+0.1)
  if (candidate.syncedLyrics) {
    baseScore += 0.1;
  }

  return baseScore;
}

/**
 * 자동 가사 매칭 및 수동 검색 모달에서 사용할 정제된 검색어 생성 함수
 */
export function getLyricsSearchQuery(title = '', artist = '') {
  let cleanT = getCleanTitle(title);
  let cleanA = getCleanArtist(artist);

  if (!cleanT && !cleanA) return '';

  // 만약 제목에 ' - '가 포함되어 있고 아티스트가 제목 앞뒤에 포함되어 있다면 분리
  if (cleanT.includes(' - ')) {
    const parts = cleanT.split(' - ').map(p => p.trim()).filter(Boolean);
    if (parts.length === 2) {
      const [part1, part2] = parts;
      if (cleanA && (part1.toLowerCase() === cleanA.toLowerCase() || part1.toLowerCase().includes(cleanA.toLowerCase()))) {
        cleanT = part2;
      } else if (cleanA && (part2.toLowerCase() === cleanA.toLowerCase() || part2.toLowerCase().includes(cleanA.toLowerCase()))) {
        cleanT = part1;
      } else if (!cleanA) {
        return `${part2} ${part1}`.trim();
      }
    }
  }

  // cleanT에 이미 cleanA가 포함되어 있는지 확인 (대소문자 무시)
  if (cleanA && cleanT.toLowerCase().includes(cleanA.toLowerCase())) {
    return cleanT;
  }

  if (!cleanA) return cleanT;
  if (!cleanT) return cleanA;

  return `${cleanT} ${cleanA}`.trim();
}

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
 */
export function useLyrics(title, artist, customLyrics = null) {
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

          const cleanTitle = getCleanTitle(title);
          const encodedTitle = encodeURIComponent(titleName);
          const encodedArtist = encodeURIComponent(artistName);
          const encodedCleanTitle = encodeURIComponent(cleanTitle);

          let lookupUrl = `https://lrclib.net/api/lookup?track=${encodedTitle}`;
          if (encodedArtist) {
            lookupUrl += `&artist=${encodedArtist}`;
          }
          const searchUrl = `https://lrclib.net/api/search?q=${encodedTitle}${encodedArtist ? '+' + encodedArtist : ''}`;

          const [lookupRes, searchRes] = await Promise.all([
            fetch(lookupUrl).then(r => r.ok ? r.json() : null).catch(() => null),
            fetch(searchUrl).then(r => r.ok ? r.json() : null).catch(() => null)
          ]);

          if (!active) return;

          // 1. 후보 수집 (Lookup 및 검색 결과)
          const allCandidates = [];
          if (lookupRes && (lookupRes.syncedLyrics || lookupRes.plainLyrics)) {
            allCandidates.push(lookupRes);
          }
          if (Array.isArray(searchRes) && searchRes.length > 0) {
            allCandidates.push(...searchRes);
          }

          // 2. 1차 후보군 평가
          let scoredCandidates = allCandidates
            .map(cand => ({
              cand,
              score: evaluateLyricCandidate(cand, titleName, artistName)
            }))
            .filter(item => item.score >= 0.60)
            .sort((a, b) => b.score - a.score);

          // 3. 만약 1차 후보군 중 적합한 곡(0.60 이상)이 없으면, 정제된 제목으로 fallback 검색 진행
          if (scoredCandidates.length === 0 && cleanTitle) {
            const fallbackSearchUrl = `https://lrclib.net/api/search?q=${encodedCleanTitle}`;
            const fallbackSearchRes = await fetch(fallbackSearchUrl).then(r => r.ok ? r.json() : null).catch(() => null);

            if (!active) return;

            if (Array.isArray(fallbackSearchRes) && fallbackSearchRes.length > 0) {
              const fallbackScored = fallbackSearchRes
                .map(cand => ({
                  cand,
                  score: evaluateLyricCandidate(cand, titleName, artistName)
                }))
                // fallback 검색은 아티스트 없이 검색했으므로 더 엄격한 기준(0.65 이상) 적용
                .filter(item => item.score >= 0.65)
                .sort((a, b) => b.score - a.score);

              if (fallbackScored.length > 0) {
                scoredCandidates = fallbackScored;
              }
            }
          }

          let newBestLyrics = '';
          let isExactMatch = false;
          let newIsFallback = false;

          // 4. 기준 점수를 통과한 최우선 후보 선정
          if (scoredCandidates.length > 0) {
            const best = scoredCandidates[0];
            newBestLyrics = best.cand.syncedLyrics || best.cand.plainLyrics || '';
            if (best.score >= 0.85 && best.cand.syncedLyrics) {
              isExactMatch = true;
              newIsFallback = false;
            } else {
              newIsFallback = true;
            }
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
        if (!active) return;
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
      clearTimeout(timer);
    };
  }, [title, artist, customLyrics, refreshTrigger]);

  return { lyrics, rawLrc, loading, error, isFallback, refetchLyrics };
}

