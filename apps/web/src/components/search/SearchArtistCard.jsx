import React from 'react';
import { User } from 'lucide-react';
import { formatArtistName } from '../../utils/trackUtils';

export default function SearchArtistCard({ artistItem, isSelected, onSelectArtist }) {
  const displayName = formatArtistName(artistItem.name);

  return (
    <div 
      className={`search-artist-profile-card ${isSelected ? 'is-selected' : ''}`}
      onClick={() => onSelectArtist(artistItem)}
    >
      {/* 1. 원형 아티스트 아바타 커버 */}
      <div className="artist-profile-avatar-wrap">
        {artistItem.thumbnail ? (
          <img 
            src={artistItem.thumbnail} 
            alt={displayName} 
            className="artist-profile-avatar-img"
            loading="lazy"
          />
        ) : (
          <div className="artist-profile-avatar-fallback">
            <User size={36} />
          </div>
        )}
      </div>

      {/* 2. 가수명 & 동명이인 구별 메타 정보 */}
      <div className="artist-profile-info">
        <span className="artist-profile-name" title={displayName}>
          {displayName}
        </span>
        <span className="artist-profile-sub" title={artistItem.topAlbum ? `대표: ${artistItem.topAlbum}` : ''}>
          {artistItem.genre ? `${artistItem.genre} · ` : ''}{artistItem.tracks?.length || 1}곡
        </span>
      </div>
    </div>
  );
}
