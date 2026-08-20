import React from 'react';
import { Play, Loader, Headphones, MoreVertical } from 'lucide-react';
import TrackThumbnail from '../playlist/TrackThumbnail';
import TrackActionDropdown from '../ui/TrackActionDropdown';
import { formatArtistName } from '../../utils/trackUtils';

export default function AlbumCard({ track, isPlaying, onPlay, isSearching, onAddQueue }) {
  const artworkSrc = track.artwork || (track.youtube_video_id ? `https://img.youtube.com/vi/${track.youtube_video_id}/hqdefault.jpg` : null);

  return (
    <div className={`album-card ${isPlaying ? 'album-card--playing' : ''}`}>
      <div className="album-card__cover" onClick={() => onPlay(track)}>
        {artworkSrc ? (
          <img src={artworkSrc} alt="" className="album-card__cover-img" />
        ) : (
          <TrackThumbnail
            title={track.custom_title}
            artist={track.custom_artist}
            youtubeId={track.youtube_video_id}
          />
        )}
        <div className="album-card__overlay">
          {isSearching ? (
            <div className="album-card__searching"><Loader size={20} className="spin-icon" /></div>
          ) : (
            !isPlaying && (
              <button className="album-card__play-btn" aria-label="재생">
                <Play size={36} fill="currentColor" strokeWidth={1.5} />
              </button>
            )
          )}
        </div>
        {isPlaying && <div className="album-card__now-badge"><Headphones size={36} strokeWidth={1.875} /></div>}
      </div>
      <div className="album-card__meta">
        <div className="album-card__meta-header">
          <span className="album-card__title" title={track.custom_title}>{track.custom_title}</span>
          <div className="album-card__actions" onClick={(e) => e.stopPropagation()}>
            <TrackActionDropdown
              track={track}
              onPlay={onPlay}
              onAddQueue={onAddQueue}
              align="right"
              trigger={(isOpen) => (
                <button
                  className={`album-card__kebab-btn ${isOpen ? 'active' : ''}`}
                  title="더보기"
                  aria-label="더보기"
                >
                  <MoreVertical size={14} strokeWidth={1.5} fill="currentColor" />
                </button>
              )}
            />
          </div>
        </div>
        <span className="album-card__artist" title={formatArtistName(track.custom_artist)}>{formatArtistName(track.custom_artist)}</span>
      </div>
    </div>
  );
}
