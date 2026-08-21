import React, { useState } from 'react';
import { Play, ListPlus, FolderPlus, ChevronRight, ChevronLeft, ListMusic } from 'lucide-react';
import Dropdown from './Dropdown';
import { usePlaylistsQuery } from '../../hooks/usePlaylists';
import { useAddTrackMutation } from '../../hooks/useTracks';
import { useAudio } from '../../contexts/AudioContext';
import { searchYoutube } from '../../utils/youtube';

function TrackActionDropdownContent({
  track,
  onPlay,
  onAddQueue,
  extraOptions,
  playlists,
  addTrackMutation,
  showToast,
  close,
}) {
  const [view, setView] = useState('main');

  const handleAddToPlaylist = async (targetPlaylist) => {
    if (!track) return;
    try {
      let videoId = track.youtube_video_id 
        || track.videoId 
        || (typeof track.id === 'string' && !track.id.startsWith('tr-') && track.id.length === 11 ? track.id : '');
      const title = track.custom_title || track.title || '유튜브 동영상';
      const artist = track.custom_artist || track.artist || '알 수 없는 아티스트';

      if (!videoId) {
        const query = track.searchQuery || `${title} ${artist}`;
        try {
          const results = await searchYoutube(query);
          if (results && results.length > 0) {
            videoId = results[0].youtube_video_id || results[0].id || '';
          }
        } catch (e) {
          console.warn('YouTube search failed during playlist add:', e);
        }
      }

      await addTrackMutation.mutateAsync({
        playlistId: targetPlaylist.id,
        videoId: videoId || '',
        title,
        artist,
      });

      showToast(`'${targetPlaylist.title}' 플레이리스트에 추가되었습니다.`);
      window.dispatchEvent(new Event('tracks-updated'));
      close();
    } catch (err) {
      console.error(err);
      showToast('플레이리스트 추가에 실패했습니다.');
    }
  };

  if (view === 'playlists') {
    return (
      <div className="track-dropdown-subpanel" onClick={(e) => e.stopPropagation()}>
        <div className="track-dropdown-header">
          <button
            className="track-dropdown-back-btn"
            onClick={(e) => {
              e.stopPropagation();
              setView('main');
            }}
            title="뒤로가기"
          >
            <ChevronLeft size={16} />
          </button>
          <span>플레이리스트에 추가</span>
        </div>
        <div className="track-dropdown-playlists-list scrollbar-none">
          {playlists.map((pl) => (
            <button
              key={pl.id}
              className="track-dropdown-playlist-item"
              onClick={(e) => {
                e.stopPropagation();
                handleAddToPlaylist(pl);
              }}
            >
              <span className="dropdown-item-icon"><ListMusic size={14} /></span>
              <span className="dropdown-playlist-title">{pl.title}</span>
            </button>
          ))}
          {playlists.length === 0 && (
            <div className="track-dropdown-empty">플레이리스트가 없습니다</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="track-dropdown-mainpanel" onClick={(e) => e.stopPropagation()}>
      {onPlay && (
        <button
          className="sofar-dropdown-item"
          onClick={(e) => {
            e.stopPropagation();
            onPlay(track);
            close();
          }}
        >
          <span className="dropdown-item-icon"><Play size={14} /></span>
          <span className="dropdown-item-label">지금 바로 재생</span>
        </button>
      )}

      {onAddQueue && (
        <button
          className="sofar-dropdown-item"
          onClick={(e) => {
            e.stopPropagation();
            onAddQueue(track, 'end');
            close();
          }}
        >
          <span className="dropdown-item-icon"><ListPlus size={14} /></span>
          <span className="dropdown-item-label">대기열에 추가</span>
        </button>
      )}

      <button
        className="sofar-dropdown-item"
        onClick={(e) => {
          e.stopPropagation();
          setView('playlists');
        }}
      >
        <span className="dropdown-item-icon"><FolderPlus size={14} /></span>
        <span className="dropdown-item-label" style={{ flex: 1 }}>플레이리스트에 추가</span>
        <ChevronRight size={14} style={{ opacity: 0.5, flexShrink: 0 }} />
      </button>

      {extraOptions.map((opt, idx) => {
        if (!opt) return null;
        return (
          <button
            key={idx}
            className={`sofar-dropdown-item ${opt.className || ''}`}
            onClick={(e) => {
              e.stopPropagation();
              if (opt.onClick) opt.onClick(e);
              close();
            }}
          >
            {opt.icon && <span className="dropdown-item-icon">{opt.icon}</span>}
            <span className="dropdown-item-label">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function TrackActionDropdown({
  track,
  onPlay,
  onAddQueue,
  align = 'right',
  trigger,
  extraOptions = []
}) {
  const { data: playlists = [] } = usePlaylistsQuery();
  const addTrackMutation = useAddTrackMutation();
  const { showToast } = useAudio();

  return (
    <Dropdown align={align} trigger={trigger}>
      {(close) => (
        <TrackActionDropdownContent
          track={track}
          onPlay={onPlay}
          onAddQueue={onAddQueue}
          extraOptions={extraOptions}
          playlists={playlists}
          addTrackMutation={addTrackMutation}
          showToast={showToast}
          close={close}
        />
      )}
    </Dropdown>
  );
}
