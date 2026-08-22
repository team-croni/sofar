import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Search, Play, Shuffle, ListPlus, Flame, X, Music, 
  History, TrendingUp, Sparkles, Radio, Layers,
  Compass, Disc3, Mic2, Music2, RefreshCw, ChevronDown, ChevronUp, Trash2
} from 'lucide-react';
import { useAudio } from '../../contexts/AudioContext';
import { useAuth } from '../../contexts/AuthContext';
import { Button, Input } from '../ui';
import { extractMetadataWithLocalLLM, cleanYoutubeMetadata, searchYoutube } from '../../utils/youtube';
import { searchItunesTracks } from '../../utils/itunes';

import SearchLandingView from './SearchLandingView';

import SearchTrackRow from './SearchTrackRow';
import SearchArtistCard from './SearchArtistCard';
import SearchSkeleton from './SearchSkeleton';
import { getSearchCache, setSearchCache } from '../../utils/searchCache';
import { formatArtistName } from '../../utils/trackUtils';

import './SearchPanel.css';


export default function SearchPanel() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const artistParam = searchParams.get('artist') || '';

  const { playTrack, addToQueue, showToast } = useAudio();
  const { user } = useAuth();
  
  const initialCache = useMemo(() => {
    return initialQuery ? getSearchCache(initialQuery) : null;
  }, [initialQuery]);

  const [query, setQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(() => Boolean(initialQuery.trim()) && !getSearchCache(initialQuery));
  const [results, setResults] = useState(() => getSearchCache(initialQuery) || []);
  const [hasSearched, setHasSearched] = useState(() => Boolean(initialQuery.trim()));
  const [searchedQuery, setSearchedQuery] = useState(initialQuery);
  const [selectedArtistKey, setSelectedArtistKey] = useState(null);
  const [isArtistsExpanded, setIsArtistsExpanded] = useState(false);
  const [canExpandArtists, setCanExpandArtists] = useState(false);
  const [artistsCollapsedHeight, setArtistsCollapsedHeight] = useState(null);

  const inputRef = useRef(null);
  const artistsGridRef = useRef(null);
  const lastLoggedRef = useRef({ query: '', timestamp: 0 });
  // 사용자가 직접 검색을 실행(엔터/클릭)했을 때만 true로 설정되는 플래그 (새로고침 시 false)
  const shouldLogNextSearchRef = useRef(false);

  // 최근 검색어 상태
  const [recentSearches, setRecentSearches] = useState(() => {
    try {
      const saved = localStorage.getItem('sofar_recent_searches');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  // 마운트 시 검색 입력창에 포커스
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select?.();
  }, []);

  const saveRecentSearch = (searchTerm) => {
    const trimmed = searchTerm.trim();
    if (!trimmed) return;
    setRecentSearches(prev => {
      const filtered = prev.filter(s => s.toLowerCase() !== trimmed.toLowerCase());
      const updated = [trimmed, ...filtered].slice(0, 10);
      try {
        localStorage.setItem('sofar_recent_searches', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  const removeRecentSearch = (searchTerm, e) => {
    if (e) e.stopPropagation();
    setRecentSearches(prev => {
      const updated = prev.filter(s => s !== searchTerm);
      try {
        localStorage.setItem('sofar_recent_searches', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  const clearAllRecentSearches = () => {
    setRecentSearches([]);
    try {
      localStorage.removeItem('sofar_recent_searches');
    } catch (e) {}
  };

  const executeSearch = async (searchQueryStr) => {
    const targetQuery = searchQueryStr.trim();
    if (!targetQuery) return;

    // 사용자가 직접 검색을 실행(엔터/클릭)했는지 확인 (새로고침 시에는 false)
    const isUserInitiated = shouldLogNextSearchRef.current;
    shouldLogNextSearchRef.current = false; // 소비 후 리셋

    saveRecentSearch(targetQuery);

    const cached = getSearchCache(targetQuery);
    if (cached && cached.length > 0) {
      setResults(cached);
      setHasSearched(true);
      setSearchedQuery(targetQuery);
      setLoading(false);
    } else {
      setLoading(true);
      setHasSearched(true);
      setSearchedQuery(targetQuery);
    }

    try {
      let youtubeVideoId = targetQuery;
      if (youtubeVideoId.includes('v=')) {
        youtubeVideoId = youtubeVideoId.split('v=')[1].split('&')[0];
      } else if (youtubeVideoId.includes('youtu.be/')) {
        youtubeVideoId = youtubeVideoId.split('youtu.be/')[1].split('?')[0];
      }

      let fetchedTracks = [];

      // 1) 유튜브 URL/ID 직접 입력 시
      if (youtubeVideoId.length === 11 && !youtubeVideoId.includes(' ')) {
        const meta = await extractMetadataWithLocalLLM(youtubeVideoId);
        const cleaned = cleanYoutubeMetadata(meta?.title || 'Unknown Title', meta?.author || 'Unknown Artist');

        const searchedTrack = {
          id: `search-${youtubeVideoId}-${Date.now()}`,
          youtube_video_id: youtubeVideoId,
          custom_title: meta?.title || cleaned.title,
          custom_artist: meta?.artist || cleaned.artist,
          thumbnail: meta?.artwork || `https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`,
          durationSec: meta?.durationSec || 0,
          genre: 'YouTube Direct'
        };

        fetchedTracks = [searchedTrack];
        setResults(fetchedTracks);
        setSearchCache(targetQuery, fetchedTracks);
      } else {
        // 2) 일반 키워드 검색 시 ➔ 정제된 실제 음원 DB (iTunes Open API)
        try {
          const itunesTracks = await searchItunesTracks(targetQuery, 25);

          if (itunesTracks && itunesTracks.length > 0) {
            fetchedTracks = itunesTracks;
            setResults(itunesTracks);
            setSearchCache(targetQuery, itunesTracks);
          } else {
            // iTunes DB에 없을 시 유튜브 직접 검색 폴백
            const res = await searchYoutube(targetQuery);
            if (res && res.length > 0) {
              fetchedTracks = res.map(r => ({
                id: `search-${r.youtube_video_id}-${Date.now()}`,
                youtube_video_id: r.youtube_video_id,
                custom_title: r.custom_title,
                custom_artist: r.custom_artist,
                thumbnail: r.thumbnail,
                durationSec: r.durationSec || 0,
                genre: 'YouTube'
              }));
              setResults(fetchedTracks);
              setSearchCache(targetQuery, fetchedTracks);
            } else {
              setResults([]);
            }
          }
        } catch (err) {
          console.warn('searchTracks error:', err);
          showToast?.(err.message || '검색 결과를 불러올 수 없습니다.');
        }
      }

      // ── 사용자가 직접 검색을 실행한 경우에만 백엔드 검색 집계 시스템으로 비동기 로깅 전송 ──
      if (isUserInitiated) {
        try {
          const artistsMap = new Map();
          for (const t of fetchedTracks) {
            const rawArtist = (t.custom_artist || t.artist || '').trim();
            const artist = formatArtistName(rawArtist);
            if (artist && artist !== 'Unknown Artist' && !artistsMap.has(artist.toLowerCase())) {
              artistsMap.set(artist.toLowerCase(), {
                name: artist,
                thumbnail: t.thumbnail || t.artwork || undefined,
                genre: t.genre || undefined
              });
              if (artistsMap.size >= 5) break;
            }
          }

          // 클라이언트 고유 식별자 생성/조회
          let clientId = '';
          try {
            clientId = localStorage.getItem('sofar_client_id');
            if (!clientId) {
              clientId = `usr_${Math.random().toString(36).substring(2, 10)}${Date.now().toString(36)}`;
              localStorage.setItem('sofar_client_id', clientId);
            }
          } catch (e) {
            clientId = `temp_${Date.now()}`;
          }

          const isGuest = !user || Boolean(user.isGuest);
          const userId = user && !user.isGuest ? user.id : undefined;

          // 클라이언트 사이드 중복 방지 (동일 검색어 3초 이내 중복 발송 방지)
          const now = Date.now();
          if (
            lastLoggedRef.current.query.toLowerCase().trim() === targetQuery.toLowerCase().trim() &&
            now - lastLoggedRef.current.timestamp < 3000
          ) {
            return;
          }
          lastLoggedRef.current = { query: targetQuery, timestamp: now };

          const logPayload = {
            keyword: targetQuery,
            clientId: userId ? `usr_${userId.substring(0, 8)}` : clientId,
            userId,
            isGuest,
            artists: Array.from(artistsMap.values())
          };

          fetch('/api/search/log', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'x-client-id': userId || clientId
            },
            body: JSON.stringify(logPayload),
          }).catch(() => {});
        } catch (e) {}
      }
    } catch (err) {
      console.error('Search error:', err);
      showToast?.('검색 결과를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // URL 검색어(q 파라미터) 변경 감지 (뒤로 가기 / 앞으로 가기 / 새로고침 / 직접 접근 지원)
  useEffect(() => {
    if (initialQuery) {
      setQuery(initialQuery);
      executeSearch(initialQuery);
    } else {
      // URL에 검색어가 없으면 (검색 메인 페이지로 뒤로 가기된 경우)
      setQuery('');
      setResults([]);
      setHasSearched(false);
      setSearchedQuery('');
      setSelectedArtistKey(null);
    }
  }, [initialQuery]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setSelectedArtistKey(null);
    const target = query.trim();
    if (target) {
      // 사용자가 직접 검색을 실행한 경우에만 로깅 플래그 설정
      shouldLogNextSearchRef.current = true;
      if (searchParams.get('q') !== target) {
        setSearchParams({ q: target });
      } else {
        executeSearch(target);
      }
    }
  };

  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setHasSearched(false);
    setSearchedQuery('');
    setSelectedArtistKey(null);
    setSearchParams({}, { replace: true });
    inputRef.current?.focus();
  };

  const handleSelectArtist = (artistItem) => {
    const isCurrentlySelected = selectedArtist?.id === artistItem.id;
    const newParams = new URLSearchParams(searchParams);

    if (isCurrentlySelected) {
      newParams.delete('artist');
      setSearchParams(newParams, { replace: true });
      setSelectedArtistKey(null);
    } else {
      newParams.set('artist', artistItem.name);
      setSearchParams(newParams, { replace: true });
      setSelectedArtistKey(artistItem.id);
    }
  };

  // 아티스트별 고유 식별자(동명이인 분리) 기반 그룹핑
  const artistGroups = useMemo(() => {
    if (!results || results.length === 0) return [];
    const map = new Map();

    for (const t of results) {
      const artist = (t.custom_artist || t.artist || '').trim();
      if (!artist || artist === 'Unknown Artist') continue;

      // 동명이인 분리: 고유 artist_id가 있으면 artist_id로 분리, 없으면 아티스트명+장르 조합
      const uniqueKey = t.artist_id 
        ? `id_${t.artist_id}` 
        : `name_${artist.toLowerCase()}_${(t.genre || '').toLowerCase()}`;

      if (!map.has(uniqueKey)) {
        map.set(uniqueKey, {
          id: uniqueKey,
          artistId: t.artist_id || null,
          name: artist,
          thumbnail: t.thumbnail || t.artwork || null,
          genre: t.genre || '음악',
          topAlbum: t.album || '',
          tracks: [t],
        });
      } else {
        const existing = map.get(uniqueKey);
        existing.tracks.push(t);
        if (!existing.thumbnail && (t.thumbnail || t.artwork)) {
          existing.thumbnail = t.thumbnail || t.artwork;
        }
      }
    }

    return Array.from(map.values());
  }, [results]);

  // URL artist 파라미터와 아티스트 그룹 동기화
  useEffect(() => {
    if (!artistParam) {
      setSelectedArtistKey(null);
      return;
    }
    if (artistGroups.length > 0) {
      const matched = artistGroups.find(
        g => g.name.toLowerCase() === artistParam.toLowerCase() ||
             g.id === artistParam ||
             (g.artistId && String(g.artistId) === artistParam)
      );
      if (matched) {
        setSelectedArtistKey(matched.id);
      } else {
        setSelectedArtistKey(null);
      }
    }
  }, [artistParam, artistGroups]);

  // 선택된 아티스트 정보 (URL 파라미터 또는 selectedArtistKey 기준)
  const selectedArtist = useMemo(() => {
    if (!selectedArtistKey && !artistParam) return null;
    return artistGroups.find(g => 
      (selectedArtistKey && g.id === selectedArtistKey) ||
      (artistParam && (
        g.name.toLowerCase() === artistParam.toLowerCase() ||
        g.id === artistParam ||
        (g.artistId && String(g.artistId) === artistParam)
      ))
    ) || null;
  }, [selectedArtistKey, artistParam, artistGroups]);

  // 검색어가 바뀌면 아티스트 펼침 상태 초기화
  useEffect(() => {
    setIsArtistsExpanded(false);
  }, [searchedQuery]);

  // 아티스트 그리드가 1줄(행)을 초과하는지 동적으로 계산하여 펼쳐보기 기능 제공 (접혀있을 때 1줄)
  useEffect(() => {
    const calculateArtistRows = () => {
      if (!artistsGridRef.current) return;
      const children = Array.from(artistsGridRef.current.children);
      if (children.length === 0) {
        setCanExpandArtists(false);
        setArtistsCollapsedHeight(null);
        return;
      }

      // 각 카드의 offsetTop 위치를 수집하여 고유한 행(Row) 개수 파악
      const rowTops = Array.from(new Set(children.map((c) => c.offsetTop))).sort((a, b) => a - b);

      if (rowTops.length > 1) {
        setCanExpandArtists(true);
        // 1번째 줄 카드의 높이 = 최대 1줄의 총 높이
        const firstRowCard = children[0];
        const cardHeight = firstRowCard ? firstRowCard.offsetHeight : 0;
        setArtistsCollapsedHeight(cardHeight);
      } else {
        setCanExpandArtists(false);
        setArtistsCollapsedHeight(null);
      }
    };

    const rafId = requestAnimationFrame(calculateArtistRows);
    window.addEventListener('resize', calculateArtistRows);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', calculateArtistRows);
    };
  }, [artistGroups]);

  // 트랙 목록: 아티스트 선택 시 해당 아티스트 트랙만 표시
  const remainingTracks = useMemo(() => {
    if (selectedArtist) {
      return selectedArtist.tracks;
    }
    return results;
  }, [results, selectedArtist]);

  return (
    <div className="search-panel-container">
      <div className="search-panel-content">
        {/* ── 상단 스마트 검색 헤더 바 ── */}
        <div className="search-header-box">
          <form onSubmit={handleSearchSubmit} className="search-form-modern">
            <div className="search-input-inner">
              <Search size={19} className="search-input-icon" />
              <input
                ref={inputRef}
                id="search-input"
                type="text"
                className="search-text-input"
                placeholder="곡 제목, 아티스트, 장르 또는 YouTube 링크를 입력하세요..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />

              {query && (
                <button 
                  type="button" 
                  className="search-clear-action-btn" 
                  onClick={clearSearch} 
                  title="검색어 지우기"
                >
                  <X size={16} />
                </button>
              )}

              <div className="search-shortcut-hint" title="단축키 /">
                <span>/</span>
              </div>
            </div>

            <Button 
              type="submit" 
              variant="primary" 
              disabled={!query.trim() || loading}
              className="search-submit-btn"
            >
              검색
            </Button>
          </form>

          {/* 검색 필드 바로 밑 타이틀 없는 최근 검색어 바 */}
          {recentSearches && recentSearches.length > 0 && (
            <div className="search-header-recents-bar">
              <div className="search-header-recents-list">
                {recentSearches.map((term) => (
                  <div 
                    key={term} 
                    className="header-recent-chip"
                    onClick={() => {
                      const cleanTerm = term.trim();
                      shouldLogNextSearchRef.current = true;
                      setQuery(cleanTerm);
                      setSelectedArtistKey(null);
                      setSearchParams({ q: cleanTerm });
                    }}
                  >
                    <span className="header-recent-text">{term}</span>
                    <button 
                      type="button"
                      className="header-recent-remove-btn" 
                      onClick={(e) => removeRecentSearch(term, e)}
                      title="삭제"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                <button 
                  type="button" 
                  className="header-recent-chip header-recent-chip-clear" 
                  onClick={clearAllRecentSearches}
                  title="최근 검색어 전체 삭제"
                >
                  <Trash2 size={12} className="header-recent-clear-icon" />
                  <span>전체 삭제</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── 검색 결과 뷰 또는 탐색 홈 ── */}
        {hasSearched ? (
          <div className="search-results-viewport scrollbar-none">
            {/* 검색 결과 컨트롤 헤더 */}
            <div className="results-control-bar">
              <span className="results-query-title">
                '{searchedQuery}'에 대한 검색 결과
              </span>
              {!loading && results.length > 0 && (
                <span className="results-count-text">
                  총 {results.length}개의 검색 결과
                </span>
              )}
            </div>

            {/* 결과 내용 렌더링 */}
            {loading ? (
              <SearchSkeleton />
            ) : results.length > 0 ? (
              <div className="search-results-content-wrap">
                {/* 2. 아티스트 카드 그리드 (1명 이상일 때 노출) */}
                {artistGroups.length >= 1 && (
                  <div className="artists-results-section">
                    <div className="section-header">
                      <div className="section-title-group">
                        <h3 className="section-title">가수 / 아티스트</h3>
                      </div>
                      {canExpandArtists && (
                        <button
                          type="button"
                          className="artist-expand-btn"
                          onClick={() => setIsArtistsExpanded(prev => !prev)}
                          title={isArtistsExpanded ? '아티스트 접기' : '아티스트 모두 펼쳐보기'}
                        >
                          <span>{isArtistsExpanded ? '접기' : '펼쳐보기'}</span>
                          {isArtistsExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        </button>
                      )}
                    </div>

                    <div 
                      ref={artistsGridRef}
                      className={`search-artists-grid ${!isArtistsExpanded && canExpandArtists ? 'is-collapsed' : ''}`}
                      style={!isArtistsExpanded && canExpandArtists && artistsCollapsedHeight ? { maxHeight: `${artistsCollapsedHeight}px` } : undefined}
                    >
                      {artistGroups.map((artistItem) => (
                        <SearchArtistCard
                          key={artistItem.id}
                          artistItem={artistItem}
                          isSelected={selectedArtist?.id === artistItem.id}
                          onSelectArtist={handleSelectArtist}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. 트랙 목록 섹션 */}
                <div className="tracks-list-section home-section--popular">
                  <div className="section-header">
                    <div className="section-title-group">
                      <div className="section-title-wrapper">
                        <h3 className="section-title">
                          {selectedArtist ? `${selectedArtist.name}의 음원 ${remainingTracks.length}곡` : '추천 검색 트랙'}
                        </h3>
                      </div>
                      <div className="section-title-actions">
                        <button
                          type="button"
                          className="section-header-action-btn"
                          onClick={() => {
                            if (remainingTracks.length > 0) {
                              playTrack(remainingTracks[0], remainingTracks);
                              showToast?.(`음악 ${remainingTracks.length}곡 전체 재생`);
                            }
                          }}
                          title="전체 재생"
                          aria-label="현재 목록 전체 재생"
                        >
                          <Play size={15} />
                        </button>
                        <button
                          type="button"
                          className="section-header-action-btn"
                          onClick={() => {
                            if (remainingTracks.length > 0) {
                              const randomIndex = Math.floor(Math.random() * remainingTracks.length);
                              playTrack(remainingTracks[randomIndex], remainingTracks);
                              showToast?.(`음악 ${remainingTracks.length}곡 셔플 재생`);
                            }
                          }}
                          title="셔플 재생"
                          aria-label="현재 목록 셔플 재생"
                        >
                          <Shuffle size={15} />
                        </button>
                        <button
                          type="button"
                          className="section-header-action-btn"
                          onClick={() => {
                            if (remainingTracks.length > 0) {
                              addToQueue(remainingTracks, 'end');
                            } else {
                              showToast?.('대기열에 추가할 곡이 없습니다.');
                            }
                          }}
                          title="대기열 추가"
                          aria-label="현재 목록 대기열 추가"
                        >
                          <ListPlus size={15} />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="popular-list">
                    {/* 트랙 행 목록 */}
                    {remainingTracks.map((track, idx) => (
                      <SearchTrackRow 
                        key={track.id || idx} 
                        track={track} 
                        index={idx + 1}
                        contextList={remainingTracks}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* 검색 결과가 없을 때 (Empty State) */
              <div className="search-empty-state-modern">
                <div className="empty-icon-wrap">
                  <Music2 size={40} className="empty-icon" />
                </div>
                <h3 className="empty-title">'{query}'에 대한 검색 결과가 없습니다</h3>
                <p className="empty-desc">
                  철자를 확인하시거나 아티스트 이름, 또는 YouTube 링크를 직접 입력해보세요.
                </p>
                <div className="empty-recommend-tags">
                  <span className="recommend-label">추천 검색어:</span>
                  {['잔나비', 'wave to earth', 'DAY6', 'NewJeans', '아이유'].map(rec => (
                    <button
                      key={rec}
                      type="button"
                      className="empty-rec-tag"
                      onClick={() => {
                        shouldLogNextSearchRef.current = true;
                        setQuery(rec);
                        setSelectedArtistKey(null);
                        setSearchParams({ q: rec });
                      }}
                    >
                      {rec}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* 검색 전 탐색 랜딩 허브 (Search Landing) */
          <SearchLandingView
            recentSearches={recentSearches}
            onSearchTerm={(term) => {
              const cleanTerm = term.trim();
              shouldLogNextSearchRef.current = true;
              setQuery(cleanTerm);
              setSelectedArtistKey(null);
              setSearchParams({ q: cleanTerm });
            }}
            onRemoveRecent={removeRecentSearch}
            onClearAllRecent={clearAllRecentSearches}
          />
        )}
      </div>
    </div>
  );
}
