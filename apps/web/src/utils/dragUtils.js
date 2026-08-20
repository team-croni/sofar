import { isUsableArtwork, thumbnailCache } from './thumbnailCache';

const escapeHtml = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

export const createCustomDragGhost = (track) => {
  const ghost = document.createElement('div');
  ghost.className = 'custom-drag-ghost';
  
  const title = track.custom_title || track.title || track.name || '';
  const artist = track.custom_artist || track.artist || '';

  const rawArtwork = 
    track.thumbnail || 
    track.artwork || 
    track.coverUrl || 
    track.cover || 
    track.album_cover || 
    (title ? thumbnailCache.get(artist, title) : null) || 
    (track.youtube_video_id ? `https://img.youtube.com/vi/${track.youtube_video_id}/hqdefault.jpg` : null);

  const artworkSrc = isUsableArtwork(rawArtwork) ? rawArtwork : null;

  if (artworkSrc && title) {
    thumbnailCache.set(artist, title, artworkSrc);
  }

  ghost.innerHTML = `
    <div class="drag-ghost-cover">
      ${artworkSrc ? `<img src="${escapeHtml(artworkSrc)}" class="drag-ghost-img" />` : `<div class="drag-ghost-placeholder">🎵</div>`}
    </div>
    <div class="drag-ghost-info">
      <div class="drag-ghost-title">${escapeHtml(title || '제목 없음')}</div>
      <div class="drag-ghost-artist">${escapeHtml(artist || '아티스트 미상')}</div>
    </div>
  `;
  
  document.body.appendChild(ghost);
  return ghost;
};

export const handleTrackDragStart = (e, track) => {
  const payload = JSON.stringify(track);
  e.dataTransfer.setData('application/json', payload);
  e.dataTransfer.setData('text/plain', payload);
  e.dataTransfer.effectAllowed = 'copy';

  const ghostEl = createCustomDragGhost(track);
  if (ghostEl && e.dataTransfer.setDragImage) {
    e.dataTransfer.setDragImage(ghostEl, 24, 24);
    setTimeout(() => {
      if (document.body.contains(ghostEl)) {
        document.body.removeChild(ghostEl);
      }
    }, 0);
  }
};
