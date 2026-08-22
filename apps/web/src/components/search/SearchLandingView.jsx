import React, { useState, useEffect, useMemo } from 'react';
import { TrendingUp, Mic2, User } from 'lucide-react';
import { useHomeFeed } from '../../hooks/useHomeFeed';
import RankChangeBadge from '../home/RankChangeBadge';
import { formatArtistName } from '../../utils/trackUtils';

// 아티스트/키워드 이름 정제 헬퍼
function cleanKeyword(raw) {
  if (!raw) return '';
  return formatArtistName(raw.trim());
}

const TRENDING_KEYWORDS_CACHE_KEY = 'sofar_trending_keywords_cache';
const TRENDING_ARTISTS_CACHE_KEY = 'sofar_trending_artists_cache';

function getSessionTrendingCache(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Date.now() - parsed.timestamp < 1000 * 60 * 10) {
        return parsed.data;
      }
    }
  } catch (e) {}
  return null;
}

function setSessionTrendingCache(key, data) {
  try {
    sessionStorage.setItem(key, JSON.stringify({
      timestamp: Date.now(),
      data
    }));
  } catch (e) {}
}

export default function SearchLandingView({
  recentSearches,
  onSearchTerm,
  onRemoveRecent,
  onClearAllRecent
}) {
  const { topTracks = [], statTracks = [] } = useHomeFeed();
  const [serverTrendingKeywords, setServerTrendingKeywords] = useState(() => getSessionTrendingCache(TRENDING_KEYWORDS_CACHE_KEY));
  const [serverTrendingArtists, setServerTrendingArtists] = useState(() => getSessionTrendingCache(TRENDING_ARTISTS_CACHE_KEY));

  // 실제 백엔드 서버의 실시간 인기 검색어 및 아티스트 집계 API (/api/search/trending) 조회
  useEffect(() => {
    let isMounted = true;

    async function fetchServerTrending() {
      try {
        const res = await fetch('/api/search/trending?limit=10');
        if (res.ok) {
          const json = await res.json();
          if (isMounted && json?.success) {
            if (Array.isArray(json?.data) && json.data.length > 0) {
              setServerTrendingKeywords(json.data);
              setSessionTrendingCache(TRENDING_KEYWORDS_CACHE_KEY, json.data);
            }
            if (Array.isArray(json?.artists) && json.artists.length > 0) {
              setServerTrendingArtists(json.artists);
              setSessionTrendingCache(TRENDING_ARTISTS_CACHE_KEY, json.artists);
            }
          }
        }
      } catch (err) {
        console.warn('Failed to fetch server trending, using fallback:', err);
      }
    }

    fetchServerTrending();
    // 30초마다 실시간 갱신
    const interval = setInterval(fetchServerTrending, 30000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // 서버 API 데이터 로딩 중이거나 예외 시 실시간 차트 기반 키워드 fallback 데이터 생성
  const fallbackTrendingKeywords = useMemo(() => {
    const rawList = statTracks.length > 0 ? statTracks : topTracks;
    if (!rawList || rawList.length === 0) {
      return [];
    }

    const seenKeywords = new Set();
    const result = [];
    let currentRank = 1;

    for (const track of rawList) {
      if (currentRank > 10) break;
      const rawArtist = track.custom_artist || track.artist || '';
      const artist = cleanKeyword(rawArtist);
      const title = track.custom_title || track.title || '';
      const keyword = artist || title;

      if (keyword && !seenKeywords.has(keyword)) {
        seenKeywords.add(keyword);
        
        let status = 'same';
        let diff = 0;
        if (track.rank_diff > 0) {
          status = 'up';
          diff = track.rank_diff;
        } else if (track.rank_diff < 0) {
          status = 'down';
          diff = Math.abs(track.rank_diff);
        } else if (track.is_new) {
          status = 'new';
        } else if (currentRank <= 3) {
          status = 'up';
          diff = 1;
        }

        result.push({
          rank: currentRank,
          keyword,
          status,
          diff
        });
        currentRank++;
      }
    }

    return result;
  }, [statTracks, topTracks]);

  // 실시간 차트 기반 아티스트 fallback 데이터 생성
  const fallbackTrendingArtists = useMemo(() => {
    const rawList = statTracks.length > 0 ? statTracks : topTracks;
    if (!rawList || rawList.length === 0) {
      return [];
    }

    const seenArtists = new Set();
    const result = [];
    let currentRank = 1;

    for (const track of rawList) {
      if (currentRank > 10) break;
      const rawArtist = track.custom_artist || track.artist || '';
      const artist = cleanKeyword(rawArtist);

      if (artist && artist !== 'Unknown Artist' && !seenArtists.has(artist.toLowerCase())) {
        seenArtists.add(artist.toLowerCase());

        let status = 'same';
        let diff = 0;
        if (track.rank_diff > 0) {
          status = 'up';
          diff = track.rank_diff;
        } else if (track.rank_diff < 0) {
          status = 'down';
          diff = Math.abs(track.rank_diff);
        } else if (track.is_new) {
          status = 'new';
        } else if (currentRank <= 3) {
          status = 'up';
          diff = 1;
        }

        result.push({
          rank: currentRank,
          name: artist,
          thumbnail: track.artwork || track.thumbnail || null,
          genre: track.genre || '음악',
          status,
          diff
        });
        currentRank++;
      }
    }

    return result;
  }, [statTracks, topTracks]);

  const trendingKeywords = serverTrendingKeywords || fallbackTrendingKeywords;
  const trendingArtists = serverTrendingArtists || fallbackTrendingArtists;

  return (
    <div className="search-landing-container scrollbar-none">
      {/* 실시간 인기 검색어 & 실시간 인기 아티스트 좌우 2단 배치 */}
      <div className="search-landing-dual-columns">
        {/* 좌측: 실시간 인기 검색어 */}
        <section className="search-landing-section dual-column-section">
          <div className="section-header">
            <div className="section-title-group">
              <TrendingUp size={18} className="icon-blue" />
              <h3 className="section-title">실시간 인기 검색어</h3>
            </div>
          </div>
          <div className="trending-column-list">
            {trendingKeywords.map((item) => {
              const displayKeyword = cleanKeyword(item.keyword) || item.keyword;
              return (
                <div 
                  key={item.rank} 
                  className="trending-item-card"
                  onClick={() => onSearchTerm(displayKeyword)}
                >
                  <span className={`trending-rank-num rank-${item.rank}`}>{item.rank}</span>
                  <span className="trending-keyword-name">{displayKeyword}</span>
                  <div className="trending-badge-wrapper">
                    <RankChangeBadge type={item.status} val={item.diff} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 우측: 실시간 인기 아티스트 (그리드) */}
        {trendingArtists && trendingArtists.length > 0 && (
          <section className="search-landing-section dual-column-section">
            <div className="section-header">
              <div className="section-title-group">
                <Mic2 size={18} className="icon-purple" />
                <h3 className="section-title">실시간 인기 아티스트</h3>
              </div>
            </div>
            <div className="trending-artists-landing-grid">
              {trendingArtists.map((artist) => {
                const displayName = cleanKeyword(artist.name) || artist.name;
                return (
                  <div
                    key={artist.rank || artist.name}
                    className="trending-artist-grid-card"
                    onClick={() => onSearchTerm(displayName)}
                    title={`${displayName} 검색하기`}
                  >
                    <div className="trending-artist-avatar-wrap">
                      {artist.thumbnail ? (
                        <img
                          src={artist.thumbnail}
                          alt={displayName}
                          className="trending-artist-avatar-img"
                          loading="lazy"
                        />
                      ) : (
                        <div className="trending-artist-avatar-fallback">
                          <User size={26} />
                        </div>
                      )}
                    </div>
                    <div className="trending-artist-meta">
                      <span className="trending-artist-name">{displayName}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

