import React from 'react';
import { Music, ListMusic, Heart } from 'lucide-react';
import TrackThumbnail from './TrackThumbnail';
import Dropdown from '../ui/Dropdown';
import { handleCoverKeyDown, mediaCardKebabTrigger, MediaCardActions } from '../ui/MediaCard';
import PlaylistAuthor from '../home/PlaylistAuthor';
import { handlePlaylistDragStart } from '../../utils/dragUtils';
import './PlaylistCard.css';

/** 커스텀 커버가 있으면 그 이미지, 없으면 수록곡 앞 4곡으로 2x2 모자이크 */
export function PlaylistMosaicCover({ playlist }) {
  const cover = playlist?.cover || playlist?.cover_url;
  if (cover) {
    return <img src={cover} alt="" className="media-card__img" draggable={false} />;
  }
  const tracks = playlist?.tracks || [];
  return (
    <div className="folder-tile-cover">
      {[0, 1, 2, 3].map((index) => {
        const track = tracks[index];
        if (!track || !(track.youtube_video_id || track.custom_title)) {
          return (
            <div key={index} className="folder-tile-cell empty">
              <Music size={14} className="empty-cell-icon" />
            </div>
          );
        }
        return (
          <div key={index} className="folder-tile-cell">
            <TrackThumbnail
              title={track.custom_title}
              artist={track.custom_artist}
              youtubeId={track.youtube_video_id}
              artwork={track.artwork}
            />
          </div>
        );
      })}
    </div>
  );
}

/**
 * 앱 전체에서 쓰는 플레이리스트 카드 (홈 추천, sofar 플레이리스트, 사이드바, 내 정보)
 * - 뒤에 카드가 겹친 모양으로 노래 카드와 구분
 * - 카드 어디를 눌러도 onOpen (사이드바에 그 플레이리스트를 연다). 재생은 더보기 메뉴의 '전체 재생'으로
 * - 공용 뼈대(.media-card*)는 ui/MediaCard.css, 플레이리스트에만 있는 모양은 PlaylistCard.css
 * - 커버 왼쪽 아래 곡 수, 아래에 만든 사람(아바타 + 이름)과 추천 이유
 * - 겹친 카드 모양으로 이미 플레이리스트임이 드러나므로 "플레이리스트" 같은 종류 표시는 넣지 않는다
 * - showAuthor={false}면 만든 사람 줄을 숨긴다 (예: 모두 sofar가 만든 'sofar 플레이리스트' 섹션)
 * - likeCount가 1 이상이면 같은 줄 끝에 '♥ N'을 붙인다 (0이면 표시하지 않음)
 */
export default function PlaylistCard({
  playlist,
  count,
  cover,
  coverOverlay = null,
  official = false,
  showAuthor = true,
  subText,
  likeCount = 0,
  reason,
  isActive = false,
  onOpen,
  menuOptions,
  draggable = true,
  onDragStart,
  className = '',
  style,
  rootProps,
}) {
  const title = playlist?.title || '플레이리스트';
  const trackCount = count ?? playlist?.trackCount ?? playlist?.tracks?.length ?? 0;

  return (
    <article
      className={`media-card playlist-card ${isActive ? 'playlist-card--active' : ''} ${className}`}
      style={style}
      onClick={onOpen}
      draggable={draggable}
      onDragStart={draggable ? (onDragStart || ((e) => handlePlaylistDragStart(e, playlist))) : undefined}
      {...rootProps}
    >
      <div className="media-card__cover-wrap playlist-card__cover-wrap">
        <div
          role="button"
          tabIndex={0}
          className="media-card__cover"
          aria-label={`${title} 열기`}
          onKeyDown={handleCoverKeyDown}
        >
          {cover ?? <PlaylistMosaicCover playlist={playlist} />}
          <span className="playlist-card__count">
            <ListMusic size={12} strokeWidth={2} />
            {trackCount}곡
          </span>
          {coverOverlay}
        </div>
      </div>
      <div className="media-card__meta">
        <div className="media-card__title-row">
          <span className="media-card__title" title={title}>{title}</span>
          {menuOptions?.length > 0 && (
            <MediaCardActions>
              <Dropdown options={menuOptions} align="right" trigger={mediaCardKebabTrigger} />
            </MediaCardActions>
          )}
        </div>
        {(subText || showAuthor || likeCount > 0) && (
          <span className="playlist-card__sub">
            {(subText || showAuthor) && (
              <span className="playlist-card__sub-main">
                {subText ?? <PlaylistAuthor playlist={playlist} official={official} />}
              </span>
            )}
            {likeCount > 0 && (
              <span className="playlist-card__likes" title={`좋아요 ${likeCount}개`}>
                <Heart size={11} strokeWidth={2} fill="currentColor" />
                {likeCount >= 1000 ? `${(likeCount / 1000).toFixed(likeCount >= 10000 ? 0 : 1)}천` : likeCount}
              </span>
            )}
          </span>
        )}
        {reason && <span className="media-card__reason">{reason}</span>}
      </div>
    </article>
  );
}
