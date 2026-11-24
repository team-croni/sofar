import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronUp, ChevronDown, Trash2, GripVertical, Headphones } from 'lucide-react';
import TrackThumbnail from './TrackThumbnail';
import TrackTitleMarquee from './TrackTitleMarquee';
import { TrackActionDropdown } from '../ui';
import { formatDuration } from '../../utils/durationCache';
import { useTrackDuration } from '../../hooks/useTrackDuration';
import { useAudio } from '../../contexts/AudioContext';
import { isMatchTrack, formatArtistName } from '../../utils/trackUtils';
// 한 줄 모양(.track-row-item, 드롭 위치 선)은 TrackRowItem과 같이 쓴다
import './TrackRowItem.css';
import './QueueRowItem.css';

export default function QueueRowItem({
  track,
  index,
  currentTrack,
  isPlaying,
  togglePlay,
  queueLength,
  handleDragStart,
  handleDragOver,
  handleDrop,
  handleDragEnd,
  dragOverPosition,
  moveQueueItem,
  playTrack,
  removeFromQueue
}) {
  const navigate = useNavigate();
  const { duration: audioDuration, isLoadingTrack } = useAudio();
  const isCurrent = isMatchTrack(track, currentTrack);
  const isPlayingCurrent = isCurrent && (isPlaying || isLoadingTrack);
  const [isDraggable, setIsDraggable] = useState(false);

  const displayDurationSec = useTrackDuration(track, isCurrent, audioDuration);

  const extraOptions = [
    {
      label: '대기열에서 제외',
      icon: <Trash2 size={14} />,
      onClick: () => removeFromQueue(track.id),
      className: 'btn-delete'
    },
    ...(index > 0 ? [{
      label: '위로 이동',
      icon: <ChevronUp size={14} />,
      onClick: () => moveQueueItem(index, -1)
    }] : []),
    ...(index < queueLength - 1 ? [{
      label: '아래로 이동',
      icon: <ChevronDown size={14} />,
      onClick: () => moveQueueItem(index, 1)
    }] : [])
  ];

  const handleRowClick = () => {
    if (isCurrent) {
      togglePlay();
    } else {
      playTrack(track);
    }
    navigate('/now');
  };

  return (
    <div 
      draggable={isDraggable}
      onDragStart={(e) => handleDragStart(e, index)}
      onDragOver={(e) => handleDragOver(e, index)}
      onDragEnd={(e) => {
        setIsDraggable(false);
        handleDragEnd(e);
      }}
      onDrop={(e) => handleDrop(e, index)}
      className={`track-row-item ${isCurrent ? 'active' : ''}`}
      onClick={handleRowClick}
    >
      {dragOverPosition === 'top' && <div className="drag-indicator drag-indicator-top" />}
      {dragOverPosition === 'bottom' && <div className="drag-indicator drag-indicator-bottom" />}
      <div className="track-item-meta">
        <div 
          className="drag-handle-zone" 
          onClick={(e) => e.stopPropagation()}
          onMouseEnter={() => setIsDraggable(true)}
          onMouseLeave={() => setIsDraggable(false)}
          onMouseDown={() => setIsDraggable(true)}
        >
          <GripVertical size={16} strokeWidth={1.5} />
        </div>
        <TrackThumbnail 
          title={track.custom_title || track.title} 
          artist={track.custom_artist || track.artist} 
          youtubeId={track.youtube_video_id} 
          artwork={track.artwork || track.thumbnail || track.coverUrl || track.cover}
        />
        <div className="track-meta-texts">
          <TrackTitleMarquee title={track.custom_title || track.title} isActive={isCurrent} />
          <p className="track-meta-artist">{formatArtistName(track.custom_artist || track.artist)}</p>
        </div>
      </div>
      
      <div className="track-actions">
        <div className={`track-status-badge ${isPlayingCurrent ? 'is-playing' : ''}`}>
          <span className="track-playing-indicator" title="재생 중">
            <Headphones size={14} />
          </span>
          <span className="track-duration">{formatDuration(displayDurationSec)}</span>
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <TrackActionDropdown
            track={track}
            onPlay={isCurrent ? togglePlay : () => playTrack(track)}
            extraOptions={extraOptions}
            align="right"
          />
        </div>
      </div>
    </div>
  );
}
