import React, { useState, useEffect } from 'react';
import { isUsableArtwork, thumbnailCache } from '../../utils/thumbnailCache';
import './TrackThumbnail.css';

/**
 * 곡 목록에서 사용할 미니 LP 원반 형태의 썸네일 컴포넌트
 * @param {string} title - 곡 제목
 * @param {string} artist - 아티스트명
 * @param {string} youtubeId - 유튜브 비디오 ID (Fallback용)
 */
export default function TrackThumbnail({ title, artist, youtubeId, artwork }) {
  const usableArtwork = isUsableArtwork(artwork) ? artwork : null;
  const cachedArtwork = (!usableArtwork && title) ? thumbnailCache.get(artist, title) : null;
  
  // 첫 렌더링 시점에 usableArtwork나 캐시된 앨범 커버를 즉시 사용하여 유튜브 썸네일 플리커(FOUC) 방지
  const [thumbUrl, setThumbUrl] = useState(() => usableArtwork || cachedArtwork || null);

  useEffect(() => {
    if (usableArtwork) {
      setThumbUrl(usableArtwork);
      if (title) {
        thumbnailCache.set(artist, title, usableArtwork);
      }
      return;
    }

    if (!title) {
      setThumbUrl(null);
      return;
    }

    const currentCached = thumbnailCache.get(artist, title);
    if (currentCached) {
      setThumbUrl(currentCached);
    }

    let active = true;
    thumbnailCache.resolve(artist, title).then((artworkUrl) => {
      if (active && artworkUrl) setThumbUrl(artworkUrl);
    });

    return () => {
      active = false;
    };
  }, [title, artist, usableArtwork]);

  const youtubeUrl = youtubeId ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` : null;
  const finalSrc = usableArtwork || thumbUrl || cachedArtwork || youtubeUrl;
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [finalSrc]);

  return (
    <div className="track-thumbnail-ring">
      {finalSrc && !hasError ? (
        <img 
          src={finalSrc} 
          alt="" 
          onError={() => setHasError(true)}
          className="thumbnail-disk-img"
        />
      ) : (
        <div className="thumbnail-disk-img thumbnail-disk-fallback" title={`${title} - ${artist}`}>
          <span className="thumbnail-disk-fallback-title">{(title || 'M')[0]}</span>
        </div>
      )}
    </div>
  );
}
