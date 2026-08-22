import React from 'react';
import { Play, Shuffle, ListPlus } from 'lucide-react';
import { useHomePanel } from '../../hooks/useHomePanel';
import HScrollSection from './HScrollSection';
import AlbumCard from './AlbumCard';

export default function TrendingSection() {
  const {
    topTracks,
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

  const handlePlayTopTracksAll = () => {
    if (!topTracks || topTracks.length === 0) {
      showToast('재생할 곡이 없습니다.');
      return;
    }
    playTrack(topTracks[0], topTracks);
    const chartContextObj = {
      id: 'chart-context-뜨고 있는 음악',
      title: '뜨고 있는 음악',
      tracks: topTracks,
      isChartContext: true,
    };
    if (openSharedPlaylistInSidebar) openSharedPlaylistInSidebar(chartContextObj);
    if (setPlayingSource) setPlayingSource({ type: 'shared', data: chartContextObj });
    showToast(`'뜨고 있는 음악' ${topTracks.length}곡 전체 재생`);
  };

  const trendingKey = 'shared_chart-context-뜨고 있는 음악';
  const isTrendingShuffle = isShuffleFor ? isShuffleFor(trendingKey) : false;

  const handleShuffleTopTracks = () => {
    if (!topTracks || topTracks.length === 0) {
      showToast('재생할 곡이 없습니다.');
      return;
    }
    const nextState = !isTrendingShuffle;
    if (toggleShuffleFor) toggleShuffleFor(trendingKey, nextState);

    if (!nextState) {
      showToast('셔플 재생 해제');
    } else {
      const randomIndex = Math.floor(Math.random() * topTracks.length);
      const startTrack = topTracks[randomIndex];
      const chartContextObj = {
        id: 'chart-context-뜨고 있는 음악',
        title: '뜨고 있는 음악',
        tracks: topTracks,
        isChartContext: true,
      };
      if (openSharedPlaylistInSidebar) openSharedPlaylistInSidebar(chartContextObj);
      if (setPlayingSource) setPlayingSource({ type: 'shared', data: chartContextObj });
      playTrack(startTrack, topTracks);
      showToast(`'뜨고 있는 음악' ${topTracks.length}곡 셔플 재생`);
    }
  };

  const handleAddTopTracksToQueue = () => {
    if (!topTracks || topTracks.length === 0) {
      showToast('대기열에 추가할 곡이 없습니다.');
      return;
    }
    addToQueue(topTracks, 'end');
  };

  const handleTitleClick = () => {
    const tracks = (topTracks && topTracks.length > 0) ? topTracks : [];
    const chartContextObj = {
      id: 'chart-context-뜨고 있는 음악',
      title: '뜨고 있는 음악',
      tracks: tracks,
      isChartContext: true,
    };
    if (openSharedPlaylistInSidebar) {
      openSharedPlaylistInSidebar(chartContextObj);
    } else if (setActiveSharedPlaylist) {
      setActiveSharedPlaylist(chartContextObj);
    }
  };

  const actions = (
    <div className="section-title-actions">
      <button
        className="section-header-action-btn"
        onClick={handlePlayTopTracksAll}
        title="전체 재생"
        aria-label="뜨고 있는 음악 전체 재생"
      >
        <Play size={15} />
      </button>
      <button
        className={`section-header-action-btn ${isTrendingShuffle ? 'active' : ''}`}
        onClick={handleShuffleTopTracks}
        title={isTrendingShuffle ? "셔플 재생 켬" : "셔플 재생"}
        aria-label="뜨고 있는 음악 셔플 재생"
      >
        <Shuffle size={15} />
      </button>
      <button
        className="section-header-action-btn"
        onClick={handleAddTopTracksToQueue}
        title="대기열 추가"
        aria-label="뜨고 있는 음악 대기열 추가"
      >
        <ListPlus size={15} />
      </button>
    </div>
  );

  return (
    <HScrollSection title="뜨고 있는 음악" actions={actions} onTitleClick={handleTitleClick}>
      {topTracks.map(track => {
        const isCurr = isTrackCurrent(track);
        return (
          <AlbumCard
            key={track.id}
            track={track}
            isPlaying={isCurr}
            onPlay={(t) => handlePlayTrack(t, topTracks, '뜨고 있는 음악')}
            onAddQueue={handleAddQueue}
          />
        );
      })}
    </HScrollSection>
  );
}
