import { Play, Headphones, MoreVertical } from 'lucide-react';
import { useAudio } from '../../contexts/AudioContext';
import { isMatchTrack, formatArtistName } from '../../utils/trackUtils';
import TrackThumbnail from '../playlist/TrackThumbnail';
import TrackActionDropdown from '../ui/TrackActionDropdown';
import { handleTrackDragStart } from '../../utils/dragUtils';

export default function SearchTopResult({ track }) {
  const { currentTrack, isPlaying, playTrack, togglePlay, addToQueue } = useAudio();

  if (!track) return null;

  const isCurrent = isMatchTrack(track, currentTrack);

  const handlePlayClick = (e) => {
    e?.stopPropagation();
    if (isCurrent) {
      togglePlay();
    } else {
      playTrack(track);
    }
  };

  const handleAddQueue = (t) => {
    addToQueue(t || track, 'end');
  };

  const trackTitle = track.custom_title || track.title || 'Unknown Title';
  const trackArtist = formatArtistName(track.custom_artist || track.artist || 'Unknown Artist');
  const trackAlbum = track.album || track.albumName || '';

  return (
    <div 
      className={`search-top-result-card ${isCurrent ? 'top-result--playing' : ''}`}
      draggable={true}
      onDragStart={(e) => handleTrackDragStart(e, track)}
      onClick={handlePlayClick}
    >
      {/* 1. 썸네일 커버 */}
      <div className="top-result-thumb-wrapper" onClick={handlePlayClick}>
        {track.thumbnail || track.artwork ? (
          <img 
            src={track.thumbnail || track.artwork} 
            alt={trackTitle} 
            className="top-result-thumb-img" 
            loading="lazy"
          />
        ) : (
          <TrackThumbnail
            title={trackTitle}
            artist={trackArtist}
            youtubeId={track.youtube_video_id}
          />
        )}
        <div className="top-result-thumb-overlay">
          {isCurrent && isPlaying ? (
            <Headphones size={28} className="top-result-playing-icon" />
          ) : (
            <button 
              type="button" 
              className="top-result-play-action-btn"
              onClick={handlePlayClick}
              aria-label="재생"
            >
              <Play size={26} fill="currentColor" className="play-icon-offset" />
            </button>
          )}
        </div>
      </div>

      {/* 2. 메타 정보 & 타이틀 */}
      <div className="top-result-meta">
        <span className="top-result-badge-text">가장 일치하는 결과</span>
        <h2 className="top-result-title" title={trackTitle}>
          {trackTitle}
        </h2>
        <div className="top-result-subinfo">
          <span className="top-result-artist">{trackArtist}</span>
          {trackAlbum && (
            <>
              <span className="top-result-dot">•</span>
              <span className="top-result-album">{trackAlbum}</span>
            </>
          )}
        </div>
      </div>

      {/* 3. 공통 트랙 케밥 액션 메뉴 (TrackActionDropdown) */}
      <div 
        className="top-result-actions" 
        draggable={false}
        onDragStart={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <TrackActionDropdown
          track={track}
          onPlay={() => playTrack(track)}
          onAddQueue={handleAddQueue}
          align="right"
          trigger={(isOpen) => (
            <button
              type="button"
              className={`top-result-kebab-btn ${isOpen ? 'active' : ''}`}
              title="더보기"
              aria-label="더보기"
            >
              <MoreVertical size={16} strokeWidth={1.5} fill="currentColor" />
            </button>
          )}
        />
      </div>
    </div>
  );
}
