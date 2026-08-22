import React, { useState } from 'react';
import { Sparkles, Disc, Compass, Zap } from 'lucide-react';
import { useHomePanel } from '../../hooks/useHomePanel';
import SharedPlaylistCard from './SharedPlaylistCard';

export default function CategorizedPlaylistsSection() {
  const {
    categoryPlaylists,
    playTrack,
    addToQueue,
    setQueue,
    showToast,
    activeSharedPlaylist,
    setPlayingSource,
    openSharedPlaylistInSidebar,
  } = useHomePanel();

  const [activeTab, setActiveTab] = useState('all');

  if (!categoryPlaylists || categoryPlaylists.length === 0) {
    return null;
  }

  const categoryTabs = [
    { id: 'all', label: '전체', icon: <Sparkles size={14} /> },
    { id: 'genre', label: '장르별', icon: <Disc size={14} /> },
    { id: 'theme', label: '테마/분위기', icon: <Compass size={14} /> },
    { id: 'situation', label: '상황/기분', icon: <Zap size={14} /> },
  ];

  const filteredPlaylists = categoryPlaylists.filter((pl) => {
    if (activeTab === 'all') return true;
    return pl.category === activeTab;
  });

  const handleSelectPlaylist = (pl) => {
    if (openSharedPlaylistInSidebar) openSharedPlaylistInSidebar(pl);
    if (setPlayingSource) setPlayingSource({ type: 'shared', data: pl });
  };

  const handlePlayPlaylist = (pl) => {
    if (!pl.tracks || pl.tracks.length === 0) {
      showToast('플레이리스트에 곡이 없습니다.');
      return;
    }
    playTrack(pl.tracks[0], pl.tracks);
    if (openSharedPlaylistInSidebar) openSharedPlaylistInSidebar(pl);
    if (setPlayingSource) setPlayingSource({ type: 'shared', data: pl });
    showToast(`'${pl.title}' 재생 시작 (${pl.tracks.length}곡)`);
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
          <h3 className="section-title">테마 &amp; 장르별 레파토리</h3>
        </div>
        <div className="category-filter-tabs">
          {categoryTabs.map((tab) => (
            <button
              key={tab.id}
              className={`category-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="category-tab-icon">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="playlist-folder-grid">
        {filteredPlaylists.map((pl) => {
          const isActive = activeSharedPlaylist && String(activeSharedPlaylist.id) === String(pl.id);
          return (
            <SharedPlaylistCard
              key={pl.id}
              playlist={pl}
              isActive={isActive}
              onSelectPlaylist={handleSelectPlaylist}
              onPlayPlaylist={handlePlayPlaylist}
              onAddPlaylistToQueue={handleAddPlaylistToQueue}
            />
          );
        })}
      </div>
    </section>
  );
}
