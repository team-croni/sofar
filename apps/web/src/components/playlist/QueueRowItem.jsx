import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronUp, ChevronDown, Trash2, GripVertical, Headphones } from 'lucide-react';
import TrackThumbnail from './TrackThumbnail';
import TrackTitleMarquee from './TrackTitleMarquee';
import { TrackActionDropdown } from '../ui';
import { durationCache, saveDurationCache, formatDuration } from '../../utils/durationCache';
import { fetchVideoDurations } from '../../utils/youtube';
import { itunesDurationCache } from '../../utils/thumbnailCache';
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
    return track?.duration || track?.durationSec || durationCache.get(track?.youtube_video_id)
      || itunesDurationCache.get(track?.custom_artist, track?.custom_title) || null;
  });

  useEffect(() => {
    const explicitDuration = track?.duration || track?.durationSec;
    if (explicitDuration && explicitDuration > 0) {
      setTrackDurationSec(explicitDuration);
      if (track?.youtube_video_id) {
        durationCache.set(track.youtube_video_id, explicitDuration);
        saveDurationCache();
      }
      return;
    }

    const cached = durationCache.get(track?.youtube_video_id);
    if (cached) {
      setTrackDurationSec(cached);
      return;
    }

    if (isCurrent && audioDuration > 0) {
      setTrackDurationSec(audioDuration);
      if (track?.youtube_video_id) {
        durationCache.set(track.youtube_video_id, audioDuration);
        saveDurationCache();
      }
      return;
    }

    let active = true;
    const isValidVideoId = typeof track?.youtube_video_id === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(track.youtube_video_id);
    const videoLookup = isValidVideoId
      ? fetchVideoDurations([track.youtube_video_id]).then((res) => res?.[track.youtube_video_id] || 0)
      : Promise.resolve(0);

    // 영상 길이를 알 수 없으면(미매칭·삭제된 영상·백엔드 조회 실패) iTunes 원곡 길이로 대신 표시한다.
    // 재생을 시작하면 실제 재생 길이로 바뀐다.
    videoLookup.then((videoSec) => {
      if (!active || videoSec > 0) return;
      const cachedItunes = itunesDurationCache.get(track?.custom_artist, track?.custom_title);
      if (cachedItunes) {
        setTrackDurationSec(cachedItunes);
        return;
      }
      itunesDurationCache.resolve(track?.custom_artist, track?.custom_title).then((sec) => {
        if (active && sec > 0) setTrackDurationSec((prev) => prev || sec);
      });
    });

    return () => {
      active = false;
    };
  }, [track?.id, track?.duration, track?.durationSec, track?.youtube_video_id, track?.custom_title, track?.custom_artist, isCurrent, audioDuration]);

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
