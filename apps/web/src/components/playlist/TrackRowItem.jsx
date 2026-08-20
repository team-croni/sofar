import React, { useState, useEffect } from 'react';
import { Trash2, Headphones } from 'lucide-react';
import { TrackActionDropdown } from '../ui';
import TrackThumbnail from './TrackThumbnail';
import TrackTitleMarquee from './TrackTitleMarquee';
import { durationCache, saveDurationCache, formatDuration } from '../../utils/durationCache';
import { fetchVideoDurations } from '../../utils/youtube';
import { useAudio } from '../../contexts/AudioContext';
import { isMatchTrack, formatArtistName } from '../../utils/trackUtils';
import './TrackRowItem.css';

export default function TrackRowItem({ 
  track, 
  index = 0,
  currentTrack, 
  isPlaying,
  togglePlay,
  playTrack, 
  addToQueue, 
  onDeleteTrack 
}) {
  const { duration: audioDuration, isLoadingTrack } = useAudio();

  const isCurrent = isMatchTrack(track, currentTrack);

  const isPlayingCurrent = isCurrent && (isPlaying || isLoadingTrack);

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
      if (track?.youtube_video_id) {
        durationCache.set(track.youtube_video_id, audioDuration);
        saveDurationCache();
      }
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

  const handleRowClick = () => {
    if (isCurrent) {
      togglePlay();
    } else {
      playTrack(track);
    }
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
      onClick={handleRowClick}
    >
      <div className="track-item-meta">
        <TrackThumbnail 
          title={track.custom_title} 
          artist={track.custom_artist} 
          youtubeId={track.youtube_video_id} 
          artwork={track.artwork}
        />
        <div className="track-meta-texts">
          <div style={{ display: 'flex', alignItems: 'center', width: '100%', minWidth: 0 }}>
            <TrackTitleMarquee title={track.custom_title} isActive={isCurrent} />
            {track.isRefining && (
              <span className="refining-badge" style={{ fontSize: '8px', marginLeft: '0.35rem', whiteSpace: 'nowrap' }}>
                정리 중...
              </span>
            )}
          </div>
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
            onAddQueue={addToQueue}
            extraOptions={extraOptions}
            align="right"
          />
        </div>
      </div>
    </div>
  );
}

