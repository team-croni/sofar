import React, { useState, useRef, useEffect } from 'react';
import { Plus, Check, FolderPlus, ListMusic, Loader2 } from 'lucide-react';
import { usePlaylistsQuery } from '../../hooks/usePlaylists';
import { useAddTrackMutation } from '../../hooks/useTracks';
import { useAudio } from '../../contexts/AudioContext';

export default function PlaylistSelectDropdown({ track, buttonVariant = 'icon', className = '' }) {
  const [isOpen, setIsOpen] = useState(false);
  const [addedPlaylistIds, setAddedPlaylistIds] = useState(new Set());
  const dropdownRef = useRef(null);

  const { data: playlists = [], isLoading: isPlaylistsLoading } = usePlaylistsQuery();
  const addTrackMutation = useAddTrackMutation();
  const { showToast } = useAudio();

  // 드롭다운 외부 클릭 및 외부 요소 스크롤 시 닫기
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };

    const handleScroll = (e) => {
      if (dropdownRef.current && dropdownRef.current.contains(e.target)) {
        return;
      }
      setIsOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen]);

  const handleToggle = (e) => {
    e.stopPropagation();
    setIsOpen(prev => !prev);
  };

  const handleAddToPlaylist = async (playlist, e) => {
    e.stopPropagation();
    if (!track || !playlist) return;

    try {
      await addTrackMutation.mutateAsync({
        playlistId: playlist.id,
        videoId: track.youtube_video_id || null,
        title: track.custom_title || track.title || 'Unknown Title',
        artist: track.custom_artist || track.artist || 'Unknown Artist',
      });

      setAddedPlaylistIds(prev => new Set(prev).add(playlist.id));
      showToast?.(`'${playlist.title}' 플레이리스트에 추가되었습니다.`);
    } catch (err) {
      console.error('Failed to add track to playlist:', err);
      showToast?.('플레이리스트 추가에 실패했습니다.');
    }
  };

  return (
    <div className={`playlist-dropdown-wrapper ${className}`} ref={dropdownRef}>
      <button
        type="button"
        className={`playlist-dropdown-trigger-btn ${isOpen ? 'active' : ''}`}
        onClick={handleToggle}
        title="플레이리스트에 추가"
      >
        <FolderPlus size={16} />
      </button>

      {isOpen && (
        <div className="playlist-select-popover animate-scale-in" onClick={(e) => e.stopPropagation()}>
          <div className="popover-header">
            <ListMusic size={14} className="popover-icon" />
            <span className="popover-title">플레이리스트에 추가</span>
          </div>

          <div className="popover-playlist-list scrollbar-none">
            {isPlaylistsLoading ? (
              <div className="popover-loading">
                <Loader2 size={16} className="spin-icon" />
                <span>목록 불러오는 중...</span>
              </div>
            ) : playlists.length === 0 ? (
              <div className="popover-empty">
                <span>생성된 플레이리스트가 없습니다.</span>
              </div>
            ) : (
              playlists.map((pl) => {
                const isAdded = addedPlaylistIds.has(pl.id);
                return (
                  <button
                    key={pl.id}
                    type="button"
                    className={`popover-item-btn ${isAdded ? 'is-added' : ''}`}
                    onClick={(e) => handleAddToPlaylist(pl, e)}
                    disabled={addTrackMutation.isPending && isAdded}
                  >
                    <span className="popover-item-title">{pl.title}</span>
                    {isAdded ? (
                      <Check size={14} className="added-check-icon" />
                    ) : (
                      <Plus size={14} className="add-plus-icon" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
