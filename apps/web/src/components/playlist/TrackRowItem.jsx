import React, { useState, useEffect } from 'react';
import { Trash2, Headphones } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { TrackActionDropdown } from '../ui';
import TrackThumbnail from './TrackThumbnail';
import TrackTitleMarquee from './TrackTitleMarquee';
import { durationCache, saveDurationCache, formatDuration } from '../../utils/durationCache';
import { fetchVideoDurations } from '../../utils/youtube';
import { itunesDurationCache } from '../../utils/thumbnailCache';
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

