import React from 'react';
import { Play, Headphones } from 'lucide-react';
import TrackThumbnail from '../playlist/TrackThumbnail';
import TrackActionDropdown from '../ui/TrackActionDropdown';
import { handleCoverKeyDown, mediaCardKebabTrigger, MediaCardActions } from '../ui/MediaCard';
import { formatArtistName } from '../../utils/trackUtils';
import { handleTrackDragStart } from '../../utils/dragUtils';
import './TrackCard.css';

function TrackCover({ track, isPlaying }) {
  const artwork = track.artwork
    || (track.youtube_video_id ? `https://img.youtube.com/vi/${track.youtube_video_id}/hqdefault.jpg` : null);
  if (artwork) return <img src={artwork} alt="" className="media-card__img" draggable={false} />;
  return (
    <TrackThumbnail
      title={track.custom_title}
      artist={track.custom_artist}
      youtubeId={track.youtube_video_id}
      fallback="vinyl"
      spinning={isPlaying}
    />
  );
}

/**
 * 앱 전체에서 쓰는 노래 카드 (홈 '뜨고 있는 음악', '취향 저격 추천' 노래 탭)
 * - 카드 어디를 눌러도 onPlay (키보드는 커버에서 Enter/Space)
 * - 호버하면 커버가 어두워지고 가운데 재생 아이콘, 재생 중이면 더 어둡게 + 헤드폰
 * - reason이 있으면 아티스트 아래에 추천 이유를 브랜드 색으로
 */
export default function TrackCard({
  track,
  isPlaying = false,
  reason,
  onPlay,
  onAddQueue,
  extraOptions,
  draggable = false,
  className = '',
}) {
  const artist = formatArtistName(track.custom_artist);

  return (
    <article
      className={`media-card track-card ${isPlaying ? 'track-card--playing' : ''} ${className}`}
      onClick={() => onPlay(track)}
      draggable={draggable}
      onDragStart={draggable ? (e) => handleTrackDragStart(e, track) : undefined}
    >
      <div className="media-card__cover-wrap">
        <div
          role="button"
          tabIndex={0}
          className="media-card__cover"
          aria-label={`${track.custom_title} 재생`}
          onKeyDown={handleCoverKeyDown}
        >
          <TrackCover track={track} isPlaying={isPlaying} />
          {/* 재생·헤드폰 아이콘을 둘 다 그려 두고 재생 상태에 따라 서로 교차해 사라지고 나타난다 */}
          <span className="track-card__overlay" aria-hidden="true">
            <span className="track-card__play-icon">
              <Play size={36} fill="currentColor" strokeWidth={1.5} />
            </span>
            <span className="track-card__now">
              <Headphones size={36} strokeWidth={1.875} />
            </span>
          </span>
        </div>
      </div>
      <div className="media-card__meta">
        <div className="media-card__title-row">
          <span className="media-card__title" title={track.custom_title}>{track.custom_title}</span>
          <MediaCardActions>
            <TrackActionDropdown
              track={track}
              onPlay={onPlay}
              onAddQueue={onAddQueue}
              align="right"
              trigger={mediaCardKebabTrigger}
              extraOptions={extraOptions}
            />
          </MediaCardActions>
        </div>
        <span className="track-card__artist" title={artist}>{artist}</span>
        {reason && <span className="media-card__reason track-card__reason">{reason}</span>}
      </div>
    </article>
  );
}
