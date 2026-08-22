import React, { useState, useRef, useLayoutEffect } from 'react';
import { Play, Shuffle, ListPlus, ChevronLeft, ChevronRight } from 'lucide-react';
import { useHomePanel } from '../../hooks/useHomePanel';
import StatRankRow from './StatRankRow';

export default function PopularChartSection() {
  const {
    statTracks,
    isTrackCurrent,
    handlePlayTrack,
    handleAddQueue,
    showToast,
    playTrack,
    addToQueue,
    setQueue,
    isShuffle,
    setIsShuffle,
    isShuffleFor,
    toggleShuffleFor,
    setActiveSharedPlaylist,
    setPlayingSource,
    openSharedPlaylistInSidebar,
  } = useHomePanel();

  const popularKey = 'shared_chart-context-실시간 인기 순위';
  const isPopularShuffle = isShuffleFor ? isShuffleFor(popularKey) : false;

  const [popularPage, setPopularPage] = useState(0);

  const rowElsRef = useRef(new Map());
  const prevPositionsRef = useRef(new Map());
  const prevPageRef = useRef(popularPage);

  const totalPopularPages = Math.max(1, Math.ceil((statTracks?.length || 0) / 10));
  const currentPopularTracks = statTracks.slice(popularPage * 10, (popularPage + 1) * 10);

  const getTrackKey = (track) => {
    if (!track) return 'unknown';
    if (track.youtube_video_id) return track.youtube_video_id;
    if (track.custom_title && track.custom_artist) {
      return `${track.custom_title.trim().toLowerCase()}_${track.custom_artist.trim().toLowerCase()}`;
    }
    return track.id || 'unknown';
  };

  useLayoutEffect(() => {
    if (prevPageRef.current !== popularPage) {
      prevPageRef.current = popularPage;
      prevPositionsRef.current.clear();
      rowElsRef.current.clear();
      return;
    }

    const newPositions = new Map();

    rowElsRef.current.forEach((el, key) => {
      if (!el) return;
      const newTop = el.offsetTop;
      newPositions.set(key, newTop);

      const oldTop = prevPositionsRef.current.get(key);
      if (oldTop !== undefined) {
        const deltaY = oldTop - newTop;
        if (deltaY !== 0) {
          el.style.transition = 'none';
          el.style.transform = `translateY(${deltaY}px)`;
          void el.offsetHeight;
          el.style.transition = 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)';
          el.style.transform = '';
        }
      }
    });

    prevPositionsRef.current = newPositions;
  }, [currentPopularTracks, popularPage]);

  const handlePrevPopularPage = () => {
    setPopularPage(prev => (prev > 0 ? prev - 1 : totalPopularPages - 1));
  };

  const handleNextPopularPage = () => {
    setPopularPage(prev => (prev < totalPopularPages - 1 ? prev + 1 : 0));
  };

  const handlePlayStatTracksAll = () => {
    if (!statTracks || statTracks.length === 0) {
      showToast('재생할 곡이 없습니다.');
      return;
    }
    playTrack(statTracks[0], statTracks);
    const chartContextObj = {
      id: 'chart-context-실시간 인기 순위',
      title: '실시간 인기 순위',
      tracks: statTracks,
      isChartContext: true,
    };
    if (openSharedPlaylistInSidebar) openSharedPlaylistInSidebar(chartContextObj);
    if (setPlayingSource) setPlayingSource({ type: 'shared', data: chartContextObj });
    showToast(`'실시간 인기 순위' ${statTracks.length}곡 전체 재생`);
  };

  const handleShuffleStatTracks = () => {
    if (!statTracks || statTracks.length === 0) {
      showToast('재생할 곡이 없습니다.');
      return;
    }
    const nextState = !isPopularShuffle;
    if (toggleShuffleFor) toggleShuffleFor(popularKey, nextState);

    if (!nextState) {
      showToast('셔플 재생 해제');
    } else {
      const randomIndex = Math.floor(Math.random() * statTracks.length);
      const startTrack = statTracks[randomIndex];
      const chartContextObj = {
        id: 'chart-context-실시간 인기 순위',
        title: '실시간 인기 순위',
        tracks: statTracks,
        isChartContext: true,
      };
      if (openSharedPlaylistInSidebar) openSharedPlaylistInSidebar(chartContextObj);
      if (setPlayingSource) setPlayingSource({ type: 'shared', data: chartContextObj });
      playTrack(startTrack, statTracks);
      showToast(`'실시간 인기 순위' ${statTracks.length}곡 셔플 재생`);
    }
  };

  const handleAddStatTracksToQueue = () => {
    if (!statTracks || statTracks.length === 0) {
      showToast('대기열에 추가할 곡이 없습니다.');
      return;
    }
    addToQueue(statTracks, 'end');
  };

  const handleTitleClick = () => {
    const tracks = (statTracks && statTracks.length > 0) ? statTracks : [];
    const chartContextObj = {
      id: 'chart-context-실시간 인기 순위',
      title: '실시간 인기 순위',
      tracks: tracks,
      isChartContext: true,
    };
    if (openSharedPlaylistInSidebar) {
      openSharedPlaylistInSidebar(chartContextObj);
    } else if (setActiveSharedPlaylist) {
      setActiveSharedPlaylist(chartContextObj);
    }
  };

  return (
    <section className="home-section home-section--popular">
      <div className="section-header">
        <div className="section-title-group">
          <div
            className="section-title-wrapper clickable"
            onClick={handleTitleClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleTitleClick();
              }
            }}
            title="실시간 인기 순위 상세 보기 (사이드바 전환)"
          >
            <h3 className="section-title">실시간 인기 순위</h3>
          </div>
          <div className="section-title-actions">
            <button
              className="section-header-action-btn"
              onClick={handlePlayStatTracksAll}
              title="전체 재생"
              aria-label="실시간 인기 순위 전체 재생"
            >
              <Play size={15} />
            </button>
            <button
              className={`section-header-action-btn ${isPopularShuffle ? 'active' : ''}`}
              onClick={handleShuffleStatTracks}
              title={isPopularShuffle ? "셔플 재생 켬" : "셔플 재생"}
              aria-label="실시간 인기 순위 셔플 재생"
            >
              <Shuffle size={15} />
            </button>
            <button
              className="section-header-action-btn"
              onClick={handleAddStatTracksToQueue}
              title="대기열 추가"
              aria-label="실시간 인기 순위 대기열 추가"
            >
              <ListPlus size={15} />
            </button>
          </div>
        </div>
        <div className="scroll-arrows">
          <button
            className="arrow-btn"
            onClick={handlePrevPopularPage}
            aria-label="이전 10개 인기 곡"
            title="이전 10개 곡"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="popular-page-indicator">
            {popularPage * 10 + 1} ~ {Math.min(statTracks.length, (popularPage + 1) * 10)}
          </span>
          <button
            className="arrow-btn"
            onClick={handleNextPopularPage}
            aria-label="다음 10개 인기 곡"
            title="다음 10개 곡"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="popular-list">
        {currentPopularTracks.map((track, i) => {
          const actualRank = popularPage * 10 + i + 1;
          const isCurr = isTrackCurrent(track);
          const trackKey = `${actualRank}_${getTrackKey(track)}`;
          return (
            <StatRankRow
              key={trackKey}
              ref={(el) => {
                if (el) rowElsRef.current.set(trackKey, el);
                else rowElsRef.current.delete(trackKey);
              }}
              track={track}
              rank={actualRank}
              isCurrentTrack={isCurr}
              onPlay={(t) => handlePlayTrack(t, statTracks, '실시간 인기 순위')}
              onAddQueue={handleAddQueue}
            />
          );
        })}
      </div>
    </section>
  );
}
