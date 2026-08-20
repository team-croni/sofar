import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronUp, ChevronDown, Trash2, GripVertical, Headphones } from 'lucide-react';
import TrackThumbnail from './TrackThumbnail';
import TrackTitleMarquee from './TrackTitleMarquee';
import { TrackActionDropdown } from '../ui';
import { durationCache, saveDurationCache, formatDuration } from '../../utils/durationCache';
import { fetchVideoDurations } from '../../utils/youtube';
import { useAudio } from '../../contexts/AudioContext';
import { isMatchTrack, formatArtistName } from '../../utils/trackUtils';
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

  const [trackDurationSec, setTrackDurationSec] = useState(() => {
    return track?.duration || track?.durationSec || durationCache.get(track?.youtube_video_id) || null;
  });

  useEffect(() => {
    const cached = durationCache.get(track?.youtube_video_id);
    if (cached) {
      setTrackDurationSec(cached);
      return;
    }

    if (isCurrent && audioDuration > 0) {
      setTrackDurationSec(audioDuration);
      durationCache.set(track?.youtube_video_id, audioDuration);
      saveDurationCache();
      return;
    }

    if (track?.youtube_video_id) {
      fetchVideoDurations([track.youtube_video_id]);
    }
  }, [track?.youtube_video_id, isCurrent, audioDuration]);

  useEffect(() => {
    const handleDurationCached = (e) => {
      if (e.detail?.videoId === track?.youtube_video_id && e.detail?.duration) {
        setTrackDurationSec(e.detail.duration);
      }
    };
    window.addEventListener('duration-cached', handleDurationCached);
    return () => {
      window.removeEventListener('duration-cached', handleDurationCached);
    };
  }, [track?.youtube_video_id]);

  const displayDurationSec = (isCurrent && audioDuration > 0) 
    ? audioDuration 
    : (trackDurationSec || track?.duration || track?.durationSec || durationCache.get(track?.youtube_video_id));

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
          title={track.custom_title} 
          artist={track.custom_artist} 
          youtubeId={track.youtube_video_id} 
          artwork={track.artwork}
        />
        <div className="track-meta-texts">
          <TrackTitleMarquee title={track.custom_title} isActive={isCurrent} />
          <p className="track-meta-artist">{formatArtistName(track.custom_artist)}</p>
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
