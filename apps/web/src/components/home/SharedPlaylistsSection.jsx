import React from 'react';
import { useHomePanel } from '../../hooks/useHomePanel';
import SharedPlaylistCard from './SharedPlaylistCard';

export default function SharedPlaylistsSection() {
  const {
    sharedPlaylists,
    playTrack,
    addToQueue,
    setQueue,
    showToast,
    activeSharedPlaylist,
    setActiveSharedPlaylist,
    setPlayingSource,
    openSharedPlaylistInSidebar,
  } = useHomePanel();

  const handleSelectPlaylist = (pl) => {
    if (openSharedPlaylistInSidebar) openSharedPlaylistInSidebar(pl);
    if (setPlayingSource) setPlayingSource({ type: 'shared', data: pl });
  };

  const handlePlaySharedPlaylist = (pl) => {
    if (!pl.tracks || pl.tracks.length === 0) {
      showToast('플레이리스트에 곡이 없습니다.');
      return;
    }
    playTrack(pl.tracks[0], pl.tracks);
    if (openSharedPlaylistInSidebar) openSharedPlaylistInSidebar(pl);
    if (setPlayingSource) setPlayingSource({ type: 'shared', data: pl });
    showToast(`공개 공유 플레이리스트 '${pl.title}' 재생 시작`);
  };

  const handleAddPlaylistToQueue = (pl) => {
    const tracks = pl.tracks || [];
    if (tracks.length > 0) {
      addToQueue(tracks, 'end');
    } else {
      showToast('대기열에 추가할 곡이 없습니다.');
    }
  };

  return (
    <section className="home-section home-section--recommended">
      <div className="section-header">
        <div className="section-title-group">
          <h3 className="section-title">공유 플레이리스트</h3>
        </div>
      </div>
      <div className="playlist-folder-grid">
        {sharedPlaylists.map((pl) => {
          const isActive = activeSharedPlaylist && String(activeSharedPlaylist.id) === String(pl.id);
          return (
            <SharedPlaylistCard
              key={pl.id}
              playlist={pl}
              isActive={isActive}
              onSelectPlaylist={handleSelectPlaylist}
              onPlayPlaylist={handlePlaySharedPlaylist}
              onAddPlaylistToQueue={handleAddPlaylistToQueue}
            />
          );
        })}
      </div>
    </section>
  );
}
