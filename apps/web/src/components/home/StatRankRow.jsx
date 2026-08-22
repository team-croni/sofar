import React from 'react';
import { Headphones } from 'lucide-react';
import TrackThumbnail from '../playlist/TrackThumbnail';
import TrackTitleMarquee from '../playlist/TrackTitleMarquee';
import TrackActionDropdown from '../ui/TrackActionDropdown';
import RankChangeBadge from './RankChangeBadge';
import { handleTrackDragStart } from '../../utils/dragUtils';
import { formatArtistName } from '../../utils/trackUtils';

const StatRankRow = React.forwardRef(function StatRankRow({ track, rank, isCurrentTrack, onPlay, onAddQueue }, ref) {
  return (
    <div
      ref={ref}
      className={`popular-row ${isCurrentTrack ? 'popular-row--playing' : ''}`}
      draggable={true}
      onDragStart={(e) => handleTrackDragStart(e, track)}
      onClick={() => onPlay(track)}
    >
      <span className={`popular-row__col-rank ${isCurrentTrack ? 'popular-row__col-rank--playing is-playing' : ''}`}>
        <span className="popular-row__rank-num">{rank}</span>
        <span className="popular-row__playing-icon" title="재생 중">
          <Headphones size={16} />
        </span>
      </span>
      <div className="popular-row__title-group">
        <div className="popular-row__thumb">
          {track.artwork ? (
            <img src={track.artwork} alt="" className="popular-row__thumb-img" />
          ) : (
            <TrackThumbnail
              title={track.custom_title}
              artist={track.custom_artist}
              youtubeId={track.youtube_video_id}
            />
          )}
        </div>
        <TrackTitleMarquee title={track.custom_title} isActive={isCurrentTrack} />
      </div>
      <span className="popular-row__artist">{formatArtistName(track.custom_artist)}</span>
      <div className="popular-row__col-change">
        <RankChangeBadge type={track.changeType} val={track.changeVal} />
      </div>
      <div 
        className="popular-row__actions" 
        draggable={false}
        onDragStart={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={e => e.stopPropagation()}
      >
        <TrackActionDropdown
          track={track}
          onPlay={onPlay}
          onAddQueue={onAddQueue}
          align="right"
        />
      </div>
    </div>
  );
});

export default StatRankRow;
