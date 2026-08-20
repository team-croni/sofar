import React from 'react';
import { Headphones } from 'lucide-react';
import { useAudio } from '../../contexts/AudioContext';
import { isMatchTrack, formatArtistName } from '../../utils/trackUtils';
import TrackThumbnail from '../playlist/TrackThumbnail';
import TrackTitleMarquee from '../playlist/TrackTitleMarquee';
import TrackActionDropdown from '../ui/TrackActionDropdown';
import { handleTrackDragStart } from '../../utils/dragUtils';

function formatDuration(sec) {
  if (!sec || isNaN(sec) || sec <= 0) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export default function SearchTrackRow({ track, index, contextList }) {
  const { currentTrack, playTrack, addToQueue } = useAudio();

  const isCurrent = isMatchTrack(track, currentTrack);

  const handlePlay = (t) => {
    playTrack(t || track, contextList || null);
  };

  const handleAddQueue = (t) => {
    addToQueue(t || track, 'end');
  };

  const trackTitle = track.custom_title || track.title || 'Unknown Title';
  const trackArtist = formatArtistName(track.custom_artist || track.artist || 'Unknown Artist');
  const trackAlbum = track.album || track.albumName || '';
  const durationText = formatDuration(track.durationSec);

  return (
    <div 
      className={`popular-row search-popular-row ${isCurrent ? 'popular-row--playing' : ''}`}
      draggable={true}
      onDragStart={(e) => handleTrackDragStart(e, track)}
      onClick={() => handlePlay(track)}
    >
      {/* 1. 순위 / 재생 상태 헤드폰 아이콘 */}
      <span className={`popular-row__col-rank ${isCurrent ? 'popular-row__col-rank--playing is-playing' : ''}`}>
        <span className="popular-row__rank-num">{index}</span>
        <span className="popular-row__playing-icon" title="재생 중">
          <Headphones size={16} />
        </span>
      </span>

      {/* 2. 썸네일 & 마퀴 타이틀 */}
      <div className="popular-row__title-group">
        <div className="popular-row__thumb">
          {track.thumbnail || track.artwork ? (
            <img 
              src={track.thumbnail || track.artwork} 
              alt="" 
              className="popular-row__thumb-img" 
              loading="lazy"
            />
          ) : (
            <TrackThumbnail
              title={trackTitle}
              artist={trackArtist}
              youtubeId={track.youtube_video_id}
            />
          )}
        </div>
        <TrackTitleMarquee title={trackTitle} isActive={isCurrent} />
      </div>

      {/* 3. 아티스트 */}
      <span className="popular-row__artist" title={trackArtist}>
        {trackArtist}
      </span>

      {/* 4. 앨범명 / 재생시간 */}
      <span className="popular-row__album search-track-album" title={trackAlbum}>
        {trackAlbum || (durationText ? durationText : '-')}
      </span>

      {/* 5. 공통 트랙 액션 드롭다운 (케밥 3점 메뉴) */}
      <div className="popular-row__actions" onClick={(e) => e.stopPropagation()}>
        <TrackActionDropdown
          track={track}
          onPlay={handlePlay}
          onAddQueue={handleAddQueue}
          align="right"
        />
      </div>
    </div>
  );
}
