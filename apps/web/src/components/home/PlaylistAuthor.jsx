import React from 'react';
import Avatar from '../ui/Avatar';
import sofarLogo from '@sofar/assets/sofar-logo.svg';

/**
 * 플레이리스트 만든 사람 표시: "[종류 · ][아바타] 이름[ · 부가 정보]"
 * sofar가 만든 플레이리스트는 sofar 로고를, 사용자 플레이리스트는 직접 올린 프로필 이미지를
 * 보여 주고, 없으면 이름 기반 기본 아바타를 쓴다. (스타일: PlaylistCard.css)
 */
export default function PlaylistAuthor({ playlist, official = false, prefix = null, suffix = null }) {
  const author = playlist?.author || (official ? 'sofar' : '');
  const isSofar = official || author === 'sofar';

  if (!author) {
    return <span className="playlist-author__text">{[prefix, suffix].filter(Boolean).join(' · ')}</span>;
  }

  return (
    <span className="playlist-author">
      {prefix && <span className="playlist-author__prefix">{prefix} ·</span>}
      {isSofar ? (
        <span className="playlist-author__logo" aria-hidden="true">
          <img src={sofarLogo} alt="" />
        </span>
      ) : (
        <Avatar src={playlist?.authorAvatar || null} name={author} size={16} className="playlist-author__avatar" />
      )}
      <span className="playlist-author__text">
        {author}{suffix ? ` · ${suffix}` : ''}
      </span>
    </span>
  );
}
