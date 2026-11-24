import React from 'react';
import { Headphones } from 'lucide-react';
import TrackThumbnail from '../playlist/TrackThumbnail';
import TrackTitleMarquee from '../playlist/TrackTitleMarquee';
import TrackActionDropdown from './TrackActionDropdown';
import { handleTrackDragStart } from '../../utils/dragUtils';
import { formatArtistName } from '../../utils/trackUtils';
import './RankedTrackRow.css';

/**
 * 순위가 붙은 노래 한 줄 (홈 '실시간 인기 순위', 검색 결과 곡 목록, 내 정보 '최근 좋아요한 곡')
 * - 줄 어디를 눌러도 onPlay, 재생 중이면 순위 숫자 자리에 헤드폰
 * - 넷째 칸은 화면마다 다르다: 인기 순위는 순위 변동(change), 검색은 앨범·재생 시간(album)
 */
const RankedTrackRow = React.forwardRef(function RankedTrackRow({
  track,
  rank,
  isCurrent = false,
  onPlay,
  onAddQueue,
  album,
  change,
}, ref) {
  const title = track.custom_title || track.title || 'Unknown Title';
  const artist = formatArtistName(track.custom_artist || track.artist || 'Unknown Artist');
  const artwork = track.thumbnail || track.artwork;
  const hasAlbum = album !== undefined;

  return (
    <div
      ref={ref}
      className={`popular-row ${hasAlbum ? 'popular-row--album' : ''} ${isCurrent ? 'popular-row--playing' : ''}`}
      draggable
      onDragStart={(e) => handleTrackDragStart(e, track)}
      onClick={() => onPlay(track)}
    >
      <span className={`popular-row__col-rank ${isCurrent ? 'is-playing' : ''}`}>
        <span className="popular-row__rank-num">{rank}</span>
        <span className="popular-row__playing-icon" title="재생 중">
          <Headphones size={16} />
        </span>
      </span>

      <div className="popular-row__title-group">
        <div className="popular-row__thumb">
          {artwork ? (
            <img src={artwork} alt="" className="popular-row__thumb-img" loading="lazy" />
          ) : (
            <TrackThumbnail title={title} artist={artist} youtubeId={track.youtube_video_id} />
          )}
        </div>
        <TrackTitleMarquee title={title} isActive={isCurrent} />
      </div>

      <span className="popular-row__artist" title={artist}>{artist}</span>

      {hasAlbum ? (
        <span className="popular-row__album" title={album}>{album}</span>
      ) : (
        <div className="popular-row__col-change">{change}</div>
      )}

      <div
        className="popular-row__actions"
        draggable={false}
        onDragStart={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <TrackActionDropdown track={track} onPlay={onPlay} onAddQueue={onAddQueue} align="right" />
      </div>
    </div>
  );
});

export default RankedTrackRow;
