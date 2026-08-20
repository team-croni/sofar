import React, { useEffect, useRef, useState } from 'react';
import { useAudio } from '../../contexts/AudioContext';
import { useLyrics, getCleanTitle, getCleanArtist, getLyricsSearchQuery } from '../../hooks/useLyrics';
import { formatArtistName } from '../../utils/trackUtils';
import './LyricsViewer.css';
import { Card, Modal, Button } from '../ui';
import { Edit3, Plus, RotateCcw, HelpCircle, Maximize2, Minimize2, Settings, Search, Clock, Pencil, RotateCw, LocateFixed, Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react';

export default function LyricsViewer() {
  const { 
    isPlaying,
    currentTrack, 
    currentTime, 
    seekTo, 
    updateTrackMetadata,
    isLyricsExpanded: isExpanded,
    setIsLyricsExpanded: setIsExpanded,
    isLyricsHidden,
    setIsLyricsHidden,
    showToast
  } = useAudio();

  const trackTitle = currentTrack?.custom_title || currentTrack?.title || '';
  const trackArtist = currentTrack?.custom_artist || currentTrack?.artist || '';
  
  const { lyrics, rawLrc, loading, error, isFallback, refetchLyrics } = useLyrics(
    trackTitle,
    trackArtist,
    currentTrack?.custom_lyrics || null
  );

  const [activeIndex, setActiveIndex] = useState(-1);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editedLyrics, setEditedLyrics] = useState('');
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);
  const [showSyncControls, setShowSyncControls] = useState(false);

  const handleForceRefresh = () => {
    if (refetchLyrics) {
      refetchLyrics();
      if (showToast) showToast('최신 가사 DB에서 가사를 다시 조회합니다.');
    }
  };

  const scrollToCurrentLyric = () => {
    setIsAutoScrollEnabled(true);
    if (activeIndex !== -1 && containerRef.current) {
      const activeElement = containerRef.current.children[activeIndex];
      if (activeElement) {
        activeElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }
    }
  };

  const toggleExpand = () => {
    shouldSnapNextScrollRef.current = true;
    setIsExpanded(prev => !prev);
    setIsAutoScrollEnabled(true);
  };

  const handleHideLyrics = () => {
    if (isExpanded) {
      setIsExpanded(false);
    }
    setIsLyricsHidden(true);
    if (showToast) showToast('가사를 숨겼습니다.');
  };

  const handleShowLyrics = () => {
    setIsLyricsHidden(false);
    if (showToast) showToast('가사를 표시합니다.');
  };
  const containerRef = useRef(null);
  const scrollTimeoutRef = useRef(null);
  const isInitialScrollRef = useRef(true);
  const shouldSnapNextScrollRef = useRef(false);

  // 컴포넌트 언마운트 시 타이머 클리어
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // 가사 선택 검색 모달을 위한 상태값
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);

  const handleOpenSearchModal = () => {
    setIsSearchModalOpen(true);
    const initialQuery = getLyricsSearchQuery(
      currentTrack?.custom_title || currentTrack?.title || '',
      currentTrack?.custom_artist || currentTrack?.artist || ''
    );
    setSearchQuery(initialQuery);
    performLyricsSearch(initialQuery);
  };

  const performLyricsSearch = async (queryText) => {
    if (!queryText || !queryText.trim()) return;
    setIsSearching(true);
    setSearchError(null);
    try {
      const trimmedQuery = queryText.trim();
      const cleanQ = getCleanTitle(trimmedQuery);
      
      const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(trimmedQuery)}`;
      
      // 트랙의 메타데이터 기반 lookup URL
      const trackName = currentTrack?.custom_title || currentTrack?.title || '';
      const artistName = currentTrack?.custom_artist || currentTrack?.artist || '';
      const cleanTrackName = getCleanTitle(trackName);
      const cleanArtistName = getCleanArtist(artistName);

      let lookupUrl = null;
      if (cleanTrackName || trimmedQuery) {
        lookupUrl = `https://lrclib.net/api/lookup?track=${encodeURIComponent(cleanTrackName || trimmedQuery)}${cleanArtistName ? `&artist=${encodeURIComponent(cleanArtistName)}` : ''}`;
      }

      const [searchRes, lookupRes] = await Promise.all([
        fetch(searchUrl).then(r => r.ok ? r.json() : []).catch(() => []),
        lookupUrl ? fetch(lookupUrl).then(r => r.ok ? r.json() : null).catch(() => null) : Promise.resolve(null)
      ]);

      let combinedResults = Array.isArray(searchRes) ? [...searchRes] : [];

      // lookup 결과가 유효하고 가사가 있다면 결과 목록 최상단에 추가 (중복 방지)
      if (lookupRes && (lookupRes.syncedLyrics || lookupRes.plainLyrics)) {
        const alreadyExists = combinedResults.some(r => r.id && r.id === lookupRes.id);
        if (!alreadyExists) {
          combinedResults.unshift(lookupRes);
        }
      }

      // 만약 결과가 없고, 정제된 키워드가 원본 검색어와 다를 경우 fallback 검색
      if (combinedResults.length === 0 && cleanQ && cleanQ !== trimmedQuery) {
        const fallbackUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(cleanQ)}`;
        const fallbackRes = await fetch(fallbackUrl).then(r => r.ok ? r.json() : []).catch(() => []);
        if (Array.isArray(fallbackRes)) {
          combinedResults = fallbackRes;
        }
      }

      setSearchResults(combinedResults);
    } catch (err) {
      console.error(err);
      setSearchError('네트워크 오류가 발생했습니다.');
    } finally {
      setIsSearching(false);
    }
  };

  const getLyricPreviewLines = (result) => {
    const raw = result.syncedLyrics || result.plainLyrics;
    if (!raw || !raw.trim()) return [];
    
    const lines = raw
      .split('\n')
      .map((line) => line.replace(/\[\d{2}:\d{2}\.\d{2,3}\]/g, '').replace(/\[.*?:.*?\]/g, '').trim())
      .filter((text) => text.length > 0);

    return lines.slice(0, 3);
  };

  const handleSelectLyric = (selectedLrc) => {
    if (!currentTrack) return;
    const lyricsToSave = selectedLrc.syncedLyrics || selectedLrc.plainLyrics || '';
    updateTrackMetadata(currentTrack.id, {
      custom_lyrics: lyricsToSave,
      lyric_offset: 0
    });
    setIsSearchModalOpen(false);
  };

  const offset = currentTrack?.lyric_offset || 0;
  
  // 가사가 실제 노래 가청 시점보다 미세하게 앞서 나오도록(약 0.55초) 적용하는 영점 보정치
  const SYSTEM_BIAS = 0.55; 

  // 곡이 변경되면 자동 스크롤 기본값으로 초기화 및 스크롤 위치 즉시 맨 위로 리셋 (F-LYRI-02)
  useEffect(() => {
    setIsAutoScrollEnabled(true);
    isInitialScrollRef.current = true;
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [currentTrack?.id]);

  // 실시간 가사 동기화 루프 (F-LYRI-02)
  useEffect(() => {
    if (!lyrics || lyrics.length === 0) {
      setActiveIndex(-1);
      return;
    }

    const adjustedTime = currentTime + offset + SYSTEM_BIAS;

    let targetIndex = -1;
    for (let i = 0; i < lyrics.length; i++) {
      if (adjustedTime >= lyrics[i].time) {
        targetIndex = i;
      } else {
        break;
      }
    }

    if (targetIndex !== activeIndex) {
      setActiveIndex(targetIndex);
    }
  }, [currentTime, lyrics, offset, activeIndex]);

  // 가사 스크롤 애니메이션 (F-LYRI-02)
  useEffect(() => {
    if (isAutoScrollEnabled && activeIndex !== -1 && containerRef.current) {
      const activeElement = containerRef.current.children[activeIndex];
      if (activeElement) {
        // 첫 가사이거나 첫 로드 시점 또는 확장/축소 전환 시점에는 부드럽게 스크롤하지 않고 즉시 이동
        const shouldScrollInstantly = activeIndex === 0 || isInitialScrollRef.current || shouldSnapNextScrollRef.current;
        activeElement.scrollIntoView({
          behavior: shouldScrollInstantly ? 'auto' : 'smooth',
          block: 'center'
        });
        if (isInitialScrollRef.current) {
          isInitialScrollRef.current = false;
        }
        if (shouldSnapNextScrollRef.current) {
          shouldSnapNextScrollRef.current = false;
        }
      }
    }
  }, [activeIndex, isAutoScrollEnabled, isExpanded]);

  // 수동 스크롤 감지 시 자동 스크롤 모드 해제
  const handleUserScroll = () => {
    if (isAutoScrollEnabled) {
      setIsAutoScrollEnabled(false);
    }
  };

  // 스크롤 이벤트 감지: 수동 스크롤이 완전히 멈춘 후 1.5초 뒤에 현재 활성 가사 라인이 중앙에 있으면 자동 스크롤 재개 (F-LYRI-02)
  const handleScroll = () => {
    if (isAutoScrollEnabled) return;

    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    scrollTimeoutRef.current = setTimeout(() => {
      if (activeIndex !== -1 && containerRef.current) {
        const viewport = containerRef.current;
        const activeElement = viewport.children[activeIndex];
        if (activeElement) {
          const elementCenter = activeElement.offsetTop + activeElement.offsetHeight / 2;
          const viewportCenter = viewport.scrollTop + viewport.clientHeight / 2;

          // 활성 가사 라인의 중심과 뷰포트의 중심간 거리 차이를 계산
          const distance = Math.abs(elementCenter - viewportCenter);

          // 사용자가 스크롤을 멈췄을 때 활성 가사 라인이 화면 중앙 부근(35px 이내)에 머문다면 다시 자동 정렬 모드 활성화
          if (distance <= 35) {
            setIsAutoScrollEnabled(true);
          }
        }
      }
    }, 1500); // 1.5초 유예 시간
  };

  // 가사 클릭 시 재생 시간 이동 (F-LYRI-04)
  const handleLyricClick = (time) => {
    // 이동 시에도 시스템 영점 조절 bias를 감산해주어야 정밀하게 씽크가 맞습니다.
    const targetSeekTime = Math.max(0, time - offset - SYSTEM_BIAS);
    seekTo(targetSeekTime);
  };

  // 오프셋 조절 (F-LYRI-03)
  const adjustOffset = (amount) => {
    if (!currentTrack) return;
    const newOffset = parseFloat((offset + amount).toFixed(1));
    updateTrackMetadata(currentTrack.id, { lyric_offset: newOffset });
  };

  // 오프셋 초기화
  const resetOffset = () => {
    if (!currentTrack) return;
    updateTrackMetadata(currentTrack.id, { lyric_offset: 0 });
  };

  // 직접 오프셋 입력 조정 (F-LYRI-03 고도화)
  const handleCustomOffset = () => {
    if (!currentTrack) return;
    const input = prompt('조정할 가사 오프셋 시간(초 단위, 예: 12.5 또는 -8)을 입력해 주세요:', offset);
    if (input !== null) {
      const val = parseFloat(input);
      if (!isNaN(val)) {
        updateTrackMetadata(currentTrack.id, { lyric_offset: parseFloat(val.toFixed(1)) });
      } else {
        alert('올바른 숫자를 입력해 주세요.');
      }
    }
  };

  const fileInputRef = useRef(null);

  const handleLrcFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setEditedLyrics(event.target.result);
    };
    reader.readAsText(file);
  };

  // 수동 가사 입력 활성화
  const handleEditClick = () => {
    setEditedLyrics(rawLrc || '');
    setIsEditModalOpen(true);
  };

  // 수동 가사 저장 (F-LYRI-05)
  const handleSaveLyrics = () => {
    if (!currentTrack) return;
    updateTrackMetadata(currentTrack.id, {
      custom_lyrics: editedLyrics,
      lyric_offset: 0
    });
    setIsEditModalOpen(false);
  };

  const renderCardContent = (isExpandedCard) => {
    return (
      <>
        {/* 상단 노래 제목 및 가수 항상 노출 (중앙 정렬) */}
        {isExpandedCard && (
          <div className="lyrics-static-header">
            <div className="lyrics-static-header-title">
              {currentTrack?.custom_title || currentTrack?.title || 'Unknown Title'}
            </div>
            <div className="lyrics-static-header-artist">
              {formatArtistName(currentTrack?.custom_artist || currentTrack?.artist) || 'Unknown Artist'}
            </div>
          </div>
        )}

        {/* 가사 싱크 조절바 */}
        <div className="lyrics-sync-bar">
          {!isLyricsHidden ? (
            <>
              <div className="sync-bar-left-group">
                <button 
                  type="button"
                  onClick={handleOpenSearchModal} 
                  className="sync-bar-side-btn"
                  title="가사 검색"
                >
                  <Search size={16} />
                </button>
                <button 
                  type="button"
                  onClick={handleEditClick} 
                  className="sync-bar-side-btn"
                  title={rawLrc ? "가사 수정" : "가사 등록"}
                >
                  <Edit3 size={15} />
                </button>
                <button 
                  type="button"
                  onClick={handleForceRefresh} 
                  className={`sync-bar-side-btn ${isFallback ? 'is-fallback-warn' : ''}`}
                  title={isFallback ? "임시 매칭된 가사입니다. 최신 가사 재매칭" : "최신 가사 DB에서 재매칭"}
                >
                  <RotateCw size={14} />
                </button>
                {lyrics.length > 0 && (
                  <button 
                    type="button"
                    onClick={() => setShowSyncControls(prev => !prev)} 
                    className={`sync-bar-side-btn ${showSyncControls ? 'active' : ''}`}
                    title="싱크 조절 도구 토글"
                  >
                    <Clock size={15} />
                  </button>
                )}
                {lyrics.length > 0 && activeIndex !== -1 && (
                  <button 
                    type="button"
                    onClick={scrollToCurrentLyric} 
                    className={`sync-bar-side-btn sync-target-btn ${!isAutoScrollEnabled ? 'show' : ''}`}
                    title="현재 재생 위치 가사로 이동 (자동 스크롤)"
                  >
                    <LocateFixed size={15} />
                  </button>
                )}
              </div>
              
              {showSyncControls && lyrics.length > 0 ? (
                <div className="lyrics-sync-controls">
                  <button onClick={() => adjustOffset(-5.0)} className="sync-adjust-btn" title="가사를 5초 빠르게">-5</button>
                  <button onClick={() => adjustOffset(-0.5)} className="sync-adjust-btn" title="가사를 0.5초 빠르게">-0.5</button>
                  <span className="sync-value" onClick={handleCustomOffset} title="직접 오프셋(초) 입력">
                    {offset > 0 ? `+${offset}` : offset}
                  </span>
                  <button onClick={() => adjustOffset(0.5)} className="sync-adjust-btn" title="가사를 0.5초 느리게">+0.5</button>
                  <button onClick={() => adjustOffset(5.0)} className="sync-adjust-btn" title="가사를 5초 느리게">+5</button>
                </div>
              ) : (
                <div className="sync-bar-placeholder-text">
                  {lyrics.length === 0 && rawLrc && rawLrc.trim().length > 0 ? "싱크 없음" : ""}
                </div>
              )}
              <div className="sync-bar-right-group">
                <button 
                  type="button"
                  onClick={handleHideLyrics} 
                  className="sync-bar-side-btn"
                  title="가사 숨기기"
                >
                  <EyeOff size={16} />
                </button>
                <button 
                  type="button"
                  onClick={toggleExpand} 
                  className="sync-bar-side-btn"
                  title={isExpandedCard ? "가사 뷰어 축소" : "가사 뷰어 확대"}
                >
                  {isExpandedCard ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="sync-bar-left-group">
                <button 
                  type="button"
                  onClick={handleOpenSearchModal} 
                  className="sync-bar-side-btn"
                  title="가사 검색"
                >
                  <Search size={16} />
                </button>
              </div>
              <div className="sync-bar-right-group">
                <button 
                  type="button"
                  onClick={handleShowLyrics} 
                  className="sync-bar-side-btn"
                  title="가사 보이기"
                >
                  <Eye size={16} />
                </button>
              </div>
            </>
          )}
        </div>

        {/* 가사 렌더링 영역 또는 가사 숨김 시 오디오 비주얼라이저 영역 */}
        {isLyricsHidden ? (
          <div key={`visualizer-${currentTrack?.id}`} className="lyrics-viewport scrollbar-none lyrics-visualizer-container">
            <div className={`lyrics-audio-visualizer ${isPlaying ? 'is-playing' : 'is-paused'}`}>
              <div className="visualizer-bars">
                {Array.from({ length: 6 }).map((_, i) => {
                  const animType = ((i * 7 + 3) % 6) + 1;
                  const duration = (1 + ((i * 11) % 6) * 0.16).toFixed(2); // 1s ~ 1.80s
                  const delay = (((i * 13) % 8) * 0.12).toFixed(2); // 0.00s ~ 0.84s
                  const maxScale = (0.5 + ((i * 7) % 5) * 0.08).toFixed(2); // 0.75 ~ 1.07

                  return (
                    <span
                      key={i}
                      className={`visualizer-bar eq-anim-${animType}`}
                      style={{
                        '--bar-dur': `${duration}s`,
                        '--bar-del': `${delay}s`,
                        '--bar-scale': maxScale,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        ) : loading ? (
          <div key={`loading-${currentTrack?.id}`} className="lyrics-viewport scrollbar-none lyrics-loading-container">
            가사를 불러오는 중입니다...
          </div>
        ) : error || (lyrics.length === 0 && (!rawLrc || rawLrc.trim().length === 0)) ? (
          <div key={`empty-${currentTrack?.id}`} className="lyrics-viewport scrollbar-none lyrics-empty-container">
            등록된 싱크 가사가 없습니다.
            <div className="lyrics-empty-actions">
              <button onClick={handleOpenSearchModal} className="lyrics-empty-btn">
                <Search size={12} />
                가사 검색
              </button>
              <button onClick={handleEditClick} className="lyrics-empty-btn">
                <Pencil size={12} />
                가사 작성
              </button>
              <button onClick={handleHideLyrics} className="lyrics-empty-btn" title="가사창 숨기기">
                <EyeOff size={12} />
                가사 숨기기
              </button>
            </div>
          </div>
        ) : lyrics.length === 0 && rawLrc && rawLrc.trim().length > 0 ? (
          <div key={`raw-${currentTrack?.id}`} className="lyrics-viewport scrollbar-none mask-image-vertical">
            {rawLrc.split('\n').map((line, idx) => (
              <div 
                key={idx} 
                className="raw-lyric-line"
              >
                {line.trim() || '•••'}
              </div>
            ))}
          </div>
        ) : (
          <div 
            key={`synced-${currentTrack?.id}`}
            ref={isExpandedCard === isExpanded ? containerRef : null}
            className="lyrics-viewport scrollbar-none mask-image-vertical"
            onWheel={handleUserScroll}
            onTouchMove={handleUserScroll}
            onScroll={handleScroll}
          >
            {lyrics.map((lyric, idx) => (
              <div
                key={idx}
                onClick={() => handleLyricClick(lyric.time)}
                className={`lyric-line ${idx === activeIndex ? 'active' : ''}`}
              >
                {lyric.text || '•••'}
              </div>
            ))}
          </div>
        )}
      </>
    );
  };

  if (!currentTrack) {
    return null;
  }

  const isEmpty = !isLyricsHidden && (!lyrics || lyrics.length === 0) && (!rawLrc || rawLrc.trim().length === 0);

  return (
    <div className={`lyrics-wrapper ${isLyricsHidden ? 'is-hidden-mode' : ''}`}>
      {/* 1. 축소된 기본 가사 카드 */}
      <Card className={`lyrics-card collapsed ${isExpanded ? 'hidden' : 'visible'} ${isEmpty ? 'is-empty' : ''} ${loading && !isLyricsHidden ? 'is-loading' : ''} ${isLyricsHidden ? 'is-lyrics-hidden' : ''}`}>
        {renderCardContent(false)}
      </Card>

      {/* 2. 전체화면 가사 카드 */}
      <Card className={`lyrics-card expanded ${isExpanded ? 'visible' : 'hidden'} ${isLyricsHidden ? 'is-lyrics-hidden' : ''}`}>
        {renderCardContent(true)}
      </Card>

      {/* 가사 검색 모달 (F-LYRI-06) */}
      <Modal
        isOpen={isSearchModalOpen}
        title="가사 검색"
        onClose={() => setIsSearchModalOpen(false)}
        maxWidth="680px"
      >
        <div className="lyrics-search-modal-container">
          <div className="lyrics-search-input-row">
            <div className="lyrics-search-input-wrapper">
              <Search size={15} className="lyrics-search-input-icon" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="곡명 또는 아티스트로 가사 검색..."
                className="sofar-input-field lyrics-search-input"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') performLyricsSearch(searchQuery);
                }}
              />
            </div>
            <Button variant="primary" size="md" className="lyrics-search-btn" onClick={() => performLyricsSearch(searchQuery)}>
              검색
            </Button>
          </div>

          {currentTrack?.custom_lyrics && (
            <Button 
              variant="secondary" 
              size="sm"
              leadingIcon={<RotateCcw size={14} />}
              onClick={() => {
                updateTrackMetadata(currentTrack.id, { custom_lyrics: null, lyric_offset: 0 });
                setIsSearchModalOpen(false);
              }}
              className="lyrics-search-reset-btn"
            >
              기본 가사로 초기화
            </Button>
          )}

          <div className="lyrics-search-results-list scrollbar-none">
            {isSearching ? (
              <div className="lyrics-search-message">
                <Loader2 size={22} className="spin-animation" />
                <span>가사 검색 중...</span>
              </div>
            ) : searchError ? (
              <div className="lyrics-search-message error">
                <AlertCircle size={22} />
                <span>{searchError}</span>
              </div>
            ) : searchResults.length === 0 ? (
              <div className="lyrics-search-message">
                <HelpCircle size={22} />
                <span>검색 결과가 없습니다.</span>
              </div>
            ) : (
              searchResults.map((result) => {
                const previewLines = getLyricPreviewLines(result);
                return (
                  <div
                    key={result.id}
                    onClick={() => handleSelectLyric(result)}
                    className="lyric-search-item"
                  >
                    <div className="lyric-search-item-header">
                      <div className="lyric-search-item-title-group">
                        <span className="lyric-search-item-title" title={result.trackName}>
                          {result.trackName}
                        </span>
                        <span className="lyric-search-item-artist" title={`${result.artistName} ${result.albumName ? `| ${result.albumName}` : ''}`}>
                          {result.artistName} {result.albumName ? `| ${result.albumName}` : ''}
                        </span>
                      </div>
                      <span className={`lyric-search-badge ${result.syncedLyrics ? 'synced' : 'plain'}`}>
                        {result.syncedLyrics ? '싱크 가사' : '일반 가사'}
                      </span>
                    </div>

                    <div className="lyric-search-item-preview">
                      {previewLines.length > 0 ? (
                        previewLines.map((line, idx) => (
                          <div key={idx} className="lyric-preview-line">
                            {line}
                          </div>
                        ))
                      ) : (
                        <div className="lyric-preview-empty">가사 미리보기가 없습니다.</div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </Modal>

      {/* 가사 직접 작성/수정 모달 (F-LYRI-05) */}
      <Modal
        isOpen={isEditModalOpen}
        title={rawLrc ? "가사 수정" : "가사 작성"}
        onClose={() => setIsEditModalOpen(false)}
        maxWidth="500px"
      >
        <div className="lyrics-editor-modal-container">
          <div className="editor-info-bar">
            <span className="editor-info-text">
              <HelpCircle size={13} />
              <span>LRC 태그 포맷으로 편집하거나 파일을 로드하세요.</span>
            </span>
            <button 
              type="button" 
              onClick={() => fileInputRef.current?.click()} 
              className="lyrics-action-btn lyrics-file-select-btn"
            >
              LRC 파일 선택
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              accept=".lrc" 
              onChange={handleLrcFileUpload} 
              className="lyrics-hidden-input" 
            />
          </div>
          <textarea
            value={editedLyrics}
            onChange={(e) => setEditedLyrics(e.target.value)}
            placeholder="[00:10.00]가사 첫 줄&#10;[00:15.50]가사 두 번째 줄..."
            className="lyrics-textarea"
          />
          <div className="editor-actions-row">
            <button onClick={() => setIsEditModalOpen(false)} className="btn-small-secondary">취소</button>
            <button onClick={handleSaveLyrics} className="btn-small-primary">저장</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
