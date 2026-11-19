import React from 'react';
import { Play, Music, MoreVertical, ListMusic } from 'lucide-react';
import TrackThumbnail from './TrackThumbnail';
import Dropdown from '../ui/Dropdown';
import PlaylistAuthor from '../home/PlaylistAuthor';
import { handlePlaylistDragStart } from '../../utils/dragUtils';
import './PlaylistCard.css';

/** 커스텀 커버가 있으면 그 이미지, 없으면 수록곡 앞 4곡으로 2x2 모자이크 */
export function PlaylistMosaicCover({ playlist }) {
  const cover = playlist?.cover || playlist?.cover_url;
  if (cover) {
    return <img src={cover} alt="" className="playlist-card__img" draggable={false} />;
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
 * 커버는 키보드로도 누를 수 있는 '버튼 역할' 요소다.
 * 진짜 <button>이면 드래그 유틸이 버튼에서 시작한 드래그를 막기 때문에 div로 둔다.
 */
function handleCoverKeyDown(e) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    e.currentTarget.click();
  }
}

/**
 * 앱 전체에서 쓰는 플레이리스트 카드 (홈 추천, sofar 플레이리스트, 사이드바, 내 정보)
 * - 뒤에 카드가 겹친 모양으로 노래 카드와 구분
 * - 카드 어디를 눌러도 onOpen
 * - 호버하면 노래 카드(.album-card)처럼 커버가 어두워지고 가운데 재생 버튼이 나온다 → onPlay(전체 재생)
 * - 커버 왼쪽 아래 곡 수, 아래에 만든 사람(아바타 + 이름)과 추천 이유
 * - 겹친 카드 모양으로 이미 플레이리스트임이 드러나므로 "플레이리스트" 같은 종류 표시는 넣지 않는다
 * - showAuthor={false}면 만든 사람 줄을 숨긴다 (예: 모두 sofar가 만든 'sofar 플레이리스트' 섹션)
 */
export default function PlaylistCard({
  playlist,
  count,
  cover,
  coverOverlay = null,
  official = false,
  showAuthor = true,
  subText,
  reason,
  isActive = false,
  onOpen,
  onPlay,
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
      className={`playlist-card ${isActive ? 'playlist-card--active' : ''} ${className}`}
      style={style}
      onClick={onOpen}
      draggable={draggable}
      onDragStart={draggable ? (onDragStart || ((e) => handlePlaylistDragStart(e, playlist))) : undefined}
      {...rootProps}
    >
      <div className="playlist-card__cover-wrap">
        <div
          role="button"
          tabIndex={0}
          className="playlist-card__cover"
          aria-label={`${title} 열기`}
          onKeyDown={handleCoverKeyDown}
        >
          {cover ?? <PlaylistMosaicCover playlist={playlist} />}
          <span className="playlist-card__count">
            <ListMusic size={12} strokeWidth={2} />
            {trackCount}곡
          </span>
          <span className="playlist-card__overlay">
            {onPlay && (
              <button
                type="button"
                className="playlist-card__play"
                onClick={(e) => {
                  e.stopPropagation();
                  onPlay(e);
                }}
                aria-label={`${title} 전체 재생`}
                title="전체 재생"
              >
                <Play size={36} fill="currentColor" strokeWidth={1.5} />
              </button>
            )}
          </span>
          {coverOverlay}
        </div>
      </div>
      <div className="playlist-card__meta">
        <div className="playlist-card__title-row">
          <span className="playlist-card__title" title={title}>{title}</span>
          {menuOptions?.length > 0 && (
            <div
              className="playlist-card__actions"
              data-no-dnd="true"
              onClick={(e) => e.stopPropagation()}
            >
              <Dropdown
                options={menuOptions}
                align="right"
                trigger={(isOpen) => (
                  <button
                    type="button"
                    className={`playlist-card__kebab ${isOpen ? 'active' : ''}`}
                    title="더보기"
                    aria-label="더보기"
                  >
                    <MoreVertical size={14} strokeWidth={1.5} fill="currentColor" />
                  </button>
                )}
              />
            </div>
          )}
        </div>
        {(subText || showAuthor) && (
          <span className="playlist-card__sub">
            {subText ?? <PlaylistAuthor playlist={playlist} official={official} />}
          </span>
        )}
        {reason && <span className="playlist-card__reason">{reason}</span>}
      </div>
    </article>
  );
}
