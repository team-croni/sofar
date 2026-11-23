import React from 'react';
import { useNavigate } from 'react-router-dom';
import Avatar from '../ui/Avatar';
import sofarLogo from '@sofar/assets/sofar-logo.svg';
import { channelPath } from '../../hooks/useChannel';

/**
 * 플레이리스트 만든 사람 표시: "[종류 · ][아바타] 이름[ · 부가 정보]"
 * sofar가 만든 플레이리스트는 sofar 로고를, 사용자 플레이리스트는 직접 올린 프로필 이미지를
 * 보여 주고, 없으면 이름 기반 기본 아바타를 쓴다. (스타일: PlaylistCard.css)
 * 핸들(authorHandle)이 있으면 아바타·이름이 그 사람의 채널(/@handle)로 가는 링크가 된다.
 * (익명으로 공유한 플레이리스트에는 서버가 핸들을 내보내지 않는다)
 */
export default function PlaylistAuthor({ playlist, official = false, prefix = null, suffix = null }) {
  const navigate = useNavigate();
  const author = playlist?.author || (official ? 'sofar' : '');
  const isSofar = official || author === 'sofar';
  const handle = !isSofar ? playlist?.authorHandle : null;

  if (!author) {
    return <span className="playlist-author__text">{[prefix, suffix].filter(Boolean).join(' · ')}</span>;
  }

  const identity = (
    <>
      {isSofar ? (
        <span className="playlist-author__logo" aria-hidden="true">
          <img src={sofarLogo} alt="" />
        </span>
      ) : (
        <Avatar src={playlist?.authorAvatar || null} name={author} size={14} className="playlist-author__avatar" />
      )}
      <span className="playlist-author__text">{author}</span>
    </>
  );

  const openChannel = (e) => {
    // 카드 전체 클릭(재생·열기)으로 번지지 않게 막는다
    e.preventDefault();
    e.stopPropagation();
    navigate(channelPath(handle));
  };

  return (
    <span className="playlist-author">
      {prefix && <span className="playlist-author__prefix">{prefix} ·</span>}
      {handle ? (
        <a
          href={channelPath(handle)}
          className="playlist-author__link"
          onClick={openChannel}
          onKeyDown={(e) => e.stopPropagation()}
          draggable={false}
          title={`@${handle} 채널`}
        >
          {identity}
        </a>
      ) : identity}
      {suffix && <span className="playlist-author__suffix">· {suffix}</span>}
    </span>
  );
}
