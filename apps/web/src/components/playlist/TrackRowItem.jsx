import React from 'react';
import { Trash2, Headphones } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { TrackActionDropdown } from '../ui';
import TrackThumbnail from './TrackThumbnail';
import TrackTitleMarquee from './TrackTitleMarquee';
import { formatDuration } from '../../utils/durationCache';
import { useTrackDuration } from '../../hooks/useTrackDuration';
import { useAudio } from '../../contexts/AudioContext';
import { isMatchTrack, formatArtistName } from '../../utils/trackUtils';
import { handleTrackDragStart } from '../../utils/dragUtils';
import './TrackRowItem.css';

export default function TrackRowItem({ 
  track, 
  index = 0,
  currentTrack, 
  isPlaying,
  togglePlay,
  playTrack, 
  addToQueue, 
  onDeleteTrack,
  handleDragStart,
  handleDragOver,
  handleDrop,
  handleDragEnd,
  dragOverPosition
}) {
  const { duration: audioDuration, isLoadingTrack } = useAudio();
  const navigate = useNavigate();
  const location = useLocation();

  const isCurrent = isMatchTrack(track, currentTrack);

  const isPlayingCurrent = isCurrent && (isPlaying || isLoadingTrack);

  const displayDurationSec = useTrackDuration(track, isCurrent, audioDuration);

  const handleRowClick = () => {
    if (isCurrent) {
      togglePlay();
    } else {
      playTrack(track);
    }
    if (location.pathname !== '/now') navigate('/now');
  };

  const extraOptions = [
    ...(onDeleteTrack ? [{
      label: '삭제',
      icon: <Trash2 size={14} />,
      className: 'btn-delete',
      onClick: () => onDeleteTrack(track.id)
    }] : []),
  ];

  return (
    <div 
      className={`track-row-item ${isCurrent ? 'active' : ''}`}
      style={track.isRefining ? { opacity: 0.75 } : undefined}
      draggable={!track.isRefining}
      onDragStart={(e) => {
        if (handleDragStart) {
          handleDragStart(e, index, track);
        } else {
          handleTrackDragStart(e, track);
        }
      }}
      onDragOver={(e) => {
        if (handleDragOver) handleDragOver(e, index);
      }}
      onDragEnd={(e) => {
        if (handleDragEnd) handleDragEnd(e);
      }}
      onDrop={(e) => {
        if (handleDrop) handleDrop(e, index);
      }}
      onClick={handleRowClick}
    >
      {dragOverPosition === 'top' && <div className="drag-indicator drag-indicator-top" />}
      {dragOverPosition === 'bottom' && <div className="drag-indicator drag-indicator-bottom" />}
      <div className="track-item-meta">
        <TrackThumbnail 
          title={track.custom_title || track.title} 
          artist={track.custom_artist || track.artist} 
          youtubeId={track.youtube_video_id} 
          artwork={track.artwork || track.thumbnail || track.coverUrl || track.cover}
        />
        <div className="track-meta-texts">
          <div style={{ display: 'flex', alignItems: 'center', width: '100%', minWidth: 0 }}>
            <TrackTitleMarquee title={track.custom_title || track.title} isActive={isCurrent} />
            {track.isRefining && (
              <span className="refining-badge" style={{ fontSize: '8px', marginLeft: '0.35rem', whiteSpace: 'nowrap' }}>
                정리 중...
              </span>
            )}
          </div>
          <p className="track-meta-artist">{formatArtistName(track.custom_artist || track.artist)}</p>
        </div>
      </div>
      
      <div 
        className="track-actions"
        draggable={false}
        onDragStart={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <div className={`track-status-badge ${isPlayingCurrent ? 'is-playing' : ''}`}>
          <span className="track-playing-indicator" title="재생 중">
            <Headphones size={14} />
          </span>
          <span className="track-duration">{formatDuration(displayDurationSec)}</span>
        </div>
        <div onClick={(e) => e.stopPropagation()} draggable={false}>
          <TrackActionDropdown
            track={track}
            onPlay={isCurrent ? togglePlay : () => playTrack(track)}
            onAddQueue={addToQueue}
            extraOptions={extraOptions}
            align="right"
          />
        </div>
      </div>
    </div>
  );
}

