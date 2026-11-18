import React, { useEffect, useRef, useState } from 'react';
import { useAudio } from '../../contexts/AudioContext';
import { useLyrics } from '../../hooks/useLyrics';
import { useHideUi } from '../../hooks/useHideUi';
import LyricsSearchModal from './LyricsSearchModal';
import LyricsEditModal from './LyricsEditModal';
import AudioVisualizer from './AudioVisualizer';
import { formatArtistName } from '../../utils/trackUtils';
import './LyricsViewer.css';
import { PARTICLES_SUSPENDED_CLASS } from '../nowplaying/particleSurfaces';
import { Card } from '../ui';
import { Edit3, Maximize2, Minimize2, Search, Clock, Pencil, RotateCw, Eye, EyeOff } from 'lucide-react';

/**
 * 가사 줄을 가사 뷰포트 안에서만 가운데로 스크롤한다.
 * scrollIntoView는 스크롤 가능한 모든 상위 요소(overflow: hidden 레이아웃 포함)까지 움직여서
 * Now Playing 등장 모션 중에 전체 레이아웃이 밀려 틀어지므로 쓰지 않는다.
 * offsetTop은 transform 영향을 받지 않아 등장 모션(translateY) 중에도 정확하다.
 */
function scrollLineToCenter(viewport, line, behavior) {
  const top = line.offsetTop - (viewport.clientHeight - line.offsetHeight) / 2;
  viewport.scrollTo({ top: Math.max(0, top), behavior });
}

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
    showToast,
    duration
  } = useAudio();

  const trackTitle = currentTrack?.custom_title || currentTrack?.title || '';
  const trackArtist = currentTrack?.custom_artist || currentTrack?.artist || '';
  
  const { lyrics, rawLrc, loading, error, isFallback, isRematching, rematchLyrics } = useLyrics(
    trackTitle,
    trackArtist,
    currentTrack?.custom_lyrics || null,
    currentTrack?.durationSec || 0
  );

  const { isUiHidden } = useHideUi();

  const [activeIndex, setActiveIndex] = useState(-1);
  // 가사 작성/수정 모달 — 검색 모달과 같이 열린 시점의 곡에 고정
  const [editTarget, setEditTarget] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const currentTimeRef = useRef(0);
  currentTimeRef.current = currentTime;
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);
  const [showSyncControls, setShowSyncControls] = useState(false);

  // 가사 다시 찾기 — 결과에 따라 안내
  const REMATCH_MESSAGES = {
    updated: '더 잘 맞는 가사로 바꿨습니다.',
    confirmed: '현재 가사가 곡과 일치합니다.',
    same: '현재 가사가 가장 잘 맞습니다. 다른 가사는 가사 검색에서 고를 수 있습니다.',
    notfound: '다른 가사를 찾지 못했습니다. 가사 검색에서 직접 선택해 주세요.',
    error: '가사 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  };
  const handleRematch = async () => {
    if (isRematching) return;
    const result = await rematchLyrics();
    if (showToast && REMATCH_MESSAGES[result]) showToast(REMATCH_MESSAGES[result]);
  };

  const toggleExpand = () => {
    shouldSnapNextScrollRef.current = true;
    setIsExpanded(prev => !prev);
    resumeAutoScroll();
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

  // 수동 스크롤로 꺼진 자동 스크롤을 다시 켠다 (대기 중인 복귀 타이머도 정리)
  const resumeAutoScroll = () => {
    clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = null;
    setIsAutoScrollEnabled(true);
  };

  // 가사 확장 중에는 Now Playing 파티클 효과(눈 · 비 등)를 쉬게 함 — particleSurfaces.js 참고
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle(PARTICLES_SUSPENDED_CLASS, isExpanded);
    return () => root.classList.remove(PARTICLES_SUSPENDED_CLASS);
  }, [isExpanded]);

  // 컴포넌트 언마운트 시 타이머 클리어
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // 가사 검색 모달 — 열린 시점의 곡에 고정 (검색 중 다음 곡으로 넘어가도 엉뚱한 곡에 저장되지 않도록)
  // 닫힘 애니메이션 동안 내용이 비지 않도록 대상 정보는 닫은 뒤에도 유지하고, 열림 여부만 따로 관리
  const [searchTarget, setSearchTarget] = useState(null);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

  const handleOpenSearchModal = () => {
    if (!currentTrack) return;
    setSearchTarget({
      id: currentTrack.id,
      title: trackTitle,
      artist: trackArtist,
      duration: currentTrack.durationSec || duration || 0,
      hasCustomLyrics: Boolean(currentTrack.custom_lyrics),
    });
    setIsSearchModalOpen(true);
  };
  const closeSearchModal = () => setIsSearchModalOpen(false);

  const handleApplySearchedLyrics = (lyricsToSave) => {
    if (!searchTarget) return;
    updateTrackMetadata(searchTarget.id, { custom_lyrics: lyricsToSave, lyric_offset: 0 });
    closeSearchModal();
    if (showToast) showToast('가사를 적용했습니다.');
  };

  const handleResetSearchedLyrics = () => {
    if (!searchTarget) return;
    updateTrackMetadata(searchTarget.id, { custom_lyrics: null, lyric_offset: 0 });
    closeSearchModal();
    if (showToast) showToast('자동 매칭 가사로 되돌렸습니다.');
  };

  const offset = currentTrack?.lyric_offset || 0;
  
  // 가사가 실제 노래 가청 시점보다 미세하게 앞서 나오도록(약 0.55초) 적용하는 영점 보정치
  const SYSTEM_BIAS = 0.55; 

  // 곡이 변경되면 자동 스크롤 기본값으로 초기화 및 스크롤 위치 즉시 맨 위로 리셋 (F-LYRI-02)
  useEffect(() => {
    resumeAutoScroll();
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
        scrollLineToCenter(containerRef.current, activeElement, shouldScrollInstantly ? 'auto' : 'smooth');
        if (isInitialScrollRef.current) {
          isInitialScrollRef.current = false;
        }
        if (shouldSnapNextScrollRef.current) {
          shouldSnapNextScrollRef.current = false;
        }
      }
    }
  }, [activeIndex, isAutoScrollEnabled, isExpanded]);

  // 사용자가 다른 가사를 보다가 이 시간 동안 스크롤하지 않으면 현재 가사로 자동 복귀 (일반 · 확장 모드 공통)
  const AUTO_SCROLL_RESUME_MS = 4000;

  const scheduleAutoScrollResume = () => {
    clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      scrollTimeoutRef.current = null;
      setIsAutoScrollEnabled(true);
    }, AUTO_SCROLL_RESUME_MS);
  };

  // 휠 · 터치로 직접 스크롤하면 자동 스크롤을 끄고 복귀 타이머를 (다시) 시작
  const handleUserScroll = () => {
    if (isAutoScrollEnabled) {
      setIsAutoScrollEnabled(false);
    }
    scheduleAutoScrollResume();
  };

  // 자동 스크롤이 꺼진 동안의 스크롤(관성 스크롤 등)도 사용자 스크롤로 보고 타이머를 연장.
  // 자동 스크롤 중의 scroll 이벤트는 코드가 움직인 것이므로 무시한다.
  const handleScroll = () => {
    if (isAutoScrollEnabled) return;
    scheduleAutoScrollResume();
  };

  // 가사 클릭 시 재생 시간 이동 (F-LYRI-04)
  const handleLyricClick = (time) => {
    // 이동 시에도 시스템 영점 조절 bias를 감산해주어야 정밀하게 씽크가 맞습니다.
    const targetSeekTime = Math.max(0, time - offset - SYSTEM_BIAS);
    seekTo(targetSeekTime);
    // 클릭한 줄로 이동했으니 기다리지 않고 바로 동기화 재개
    resumeAutoScroll();
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

  // 수동 가사 입력 활성화
  const handleEditClick = () => {
    if (!currentTrack) return;
    setEditTarget({
      id: currentTrack.id,
      lyrics: rawLrc || '',
      hasCustomLyrics: Boolean(currentTrack.custom_lyrics),
    });
    setIsEditModalOpen(true);
  };

  // 수동 가사 저장 (F-LYRI-05)
  const handleSaveLyrics = (text) => {
    if (!editTarget) return;
    const trimmed = text.trim();
    updateTrackMetadata(editTarget.id, { custom_lyrics: trimmed ? text : null, lyric_offset: 0 });
    setIsEditModalOpen(false);
    if (showToast) showToast(trimmed ? '가사를 저장했습니다.' : '가사를 비워 자동 매칭으로 되돌렸습니다.');
  };

  const handleResetEditedLyrics = () => {
    if (!editTarget) return;
    updateTrackMetadata(editTarget.id, { custom_lyrics: null, lyric_offset: 0 });
    setIsEditModalOpen(false);
    if (showToast) showToast('자동 매칭 가사로 되돌렸습니다.');
  };

  // 오디오 비주얼라이저 (가사 숨김 시, 또는 가사가 없는 상태에서 UI 숨기기 시)
  const renderVisualizer = (keyPrefix) => (
    <div key={`${keyPrefix}-${currentTrack?.id}`} className="lyrics-viewport scrollbar-none lyrics-visualizer-container">
      <AudioVisualizer isPlaying={isPlaying} />
    </div>
  );

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
                {/* 직접 지정한 가사는 자동으로 찾은 가사가 아니므로 다시 찾기 대상이 아님 (검색/수정 모달에서 되돌리기) */}
                {!currentTrack?.custom_lyrics && (
                  <button
                    type="button"
                    onClick={handleRematch}
                    disabled={isRematching || loading}
                    className={`sync-bar-side-btn ${isFallback ? 'is-low-confidence' : ''} ${isRematching ? 'is-busy' : ''}`}
                    title={isRematching
                      ? '다시 찾는 중...'
                      : isFallback
                        ? '정확도가 낮은 가사 · 다시 찾기'
                        : '다시 찾기'}
                    aria-label="다시 찾기"
                  >
                    <RotateCw size={14} className={isRematching ? 'spin-animation' : ''} />
                  </button>
                )}
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
          renderVisualizer('visualizer')
        ) : loading ? (
          <div key={`loading-${currentTrack?.id}`} className="lyrics-viewport scrollbar-none lyrics-loading-container">
            가사를 불러오는 중입니다...
          </div>
        ) : (error || (lyrics.length === 0 && (!rawLrc || rawLrc.trim().length === 0))) && isUiHidden ? (
          // 가사가 없을 때 UI 숨기기(녹화 등) 상태에서는 안내 문구 대신 비주얼라이저
          renderVisualizer('empty-visualizer')
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
      {/* data-particle-occluder: 콘텐츠 위에 그리는 파티클 앞쪽 캔버스(쌓인 눈 · 앞쪽 눈송이)가 확장 가사창 위로 그리지 않도록 가림
          (숨김 상태는 visibility: hidden이라 가리지 않고, 열리고 닫히는 중에는 투명도만큼만 가림) */}
      <Card
        className={`lyrics-card expanded ${isExpanded ? 'visible' : 'hidden'} ${isLyricsHidden ? 'is-lyrics-hidden' : ''}`}
        data-particle-occluder=""
      >
        {renderCardContent(true)}
      </Card>

      {/* 가사 검색 모달 (F-LYRI-06) */}
      <LyricsSearchModal
        isOpen={isSearchModalOpen}
        onClose={closeSearchModal}
        track={searchTarget}
        currentLyrics={searchTarget?.id === currentTrack?.id ? rawLrc : ''}
        hasCustomLyrics={Boolean(searchTarget?.hasCustomLyrics)}
        onApply={handleApplySearchedLyrics}
        onReset={handleResetSearchedLyrics}
      />

      {/* 가사 직접 작성/수정 모달 (F-LYRI-05) */}
      <LyricsEditModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        initialLyrics={editTarget?.lyrics || ''}
        hasCustomLyrics={Boolean(editTarget?.hasCustomLyrics)}
        getCurrentTime={() => currentTimeRef.current}
        onSave={handleSaveLyrics}
        onReset={handleResetEditedLyrics}
      />
    </div>
  );
}
