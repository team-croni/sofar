import React, { useMemo, useState } from 'react';
import { useHomePanel } from '../../hooks/useHomePanel';
import SharedPlaylistCard from './SharedPlaylistCard';

const FILTERS = [
  { id: 'genre', label: '장르' },
  { id: 'theme', label: '테마' },
  { id: 'situation', label: '상황' },
  { id: 'shared', label: '공유' },
];

export default function RecommendedPlaylistsSection() {
  const {
    categoryPlaylists,
    sharedPlaylists,
    playTrack,
    addToQueue,
    setQueue,
    showToast,
    activeSharedPlaylist,
    setPlayingSource,
    openSharedPlaylistInSidebar,
  } = useHomePanel();
  const [activeFilter, setActiveFilter] = useState('genre');

  const playlists = useMemo(() => [
    ...(categoryPlaylists || []).map((playlist) => ({
      ...playlist,
      playlistSource: 'category',
    })),
    ...(sharedPlaylists || []).map((playlist) => ({
      ...playlist,
      playlistSource: 'shared',
    })),
  ], [categoryPlaylists, sharedPlaylists]);

  if (playlists.length === 0) return null;

  const filteredPlaylists = playlists.filter((playlist) => {
    if (activeFilter === 'shared') return playlist.playlistSource === 'shared';
    return playlist.category === activeFilter;
  });

  const handleSelectPlaylist = (playlist) => {
    openSharedPlaylistInSidebar?.(playlist);
    setPlayingSource?.({ type: 'shared', data: playlist });
  };

  const handlePlayPlaylist = (playlist) => {
    if (!playlist.tracks || playlist.tracks.length === 0) {
      showToast('플레이리스트에 곡이 없습니다.');
      return;
    }
    playTrack(playlist.tracks[0], playlist.tracks);
    openSharedPlaylistInSidebar?.(playlist);
    setPlayingSource?.({ type: 'shared', data: playlist });
    showToast(`'${playlist.title}' 재생 시작 (${playlist.tracks.length}곡)`);
  };

  const handleAddPlaylistToQueue = (playlist) => {
    const tracks = playlist.tracks || [];
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
          <h3 className="section-title">추천 플레이리스트</h3>
        </div>
        <div className="category-filter-tabs" role="tablist" aria-label="추천 플레이리스트 필터">
          {FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              role="tab"
              aria-selected={activeFilter === filter.id}
              className={`category-tab-btn ${activeFilter === filter.id ? 'active' : ''}`}
              onClick={() => setActiveFilter(filter.id)}
            >
              <span>{filter.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="playlist-folder-grid">
        {filteredPlaylists.map((playlist) => {
          const isActive = activeSharedPlaylist
            && String(activeSharedPlaylist.id) === String(playlist.id);
          return (
            <SharedPlaylistCard
              key={`${playlist.playlistSource}-${playlist.id}`}
              playlist={playlist}
              isActive={isActive}
              onSelectPlaylist={handleSelectPlaylist}
              onPlayPlaylist={handlePlayPlaylist}
              onAddPlaylistToQueue={handleAddPlaylistToQueue}
            />
          );
        })}
        {filteredPlaylists.length === 0 && (
          <p className="empty-list-message">
            플레이리스트가 아직 없습니다.
          </p>
        )}
      </div>
    </section>
  );
}
