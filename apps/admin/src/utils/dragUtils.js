const escapeHtml = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

export const createCustomDragGhost = (track) => {
  if (!track) return null;
  const ghost = document.createElement('div');
  ghost.className = 'custom-drag-ghost';

  const artworkSrc =
    track.artwork ||
    track.thumbnail ||
    track.cover ||
    track.cover_url ||
    (track.youtube_video_id ? `https://img.youtube.com/vi/${track.youtube_video_id}/hqdefault.jpg` : null);

  const title = track.custom_title || track.title || '제목 없음';
  const artist = track.custom_artist || track.artist || '아티스트 미상';

  ghost.innerHTML = `
    <div class="drag-ghost-cover">
      ${artworkSrc ? `<img src="${escapeHtml(artworkSrc)}" class="drag-ghost-img" />` : `<div class="drag-ghost-placeholder">🎵</div>`}
    </div>
    <div class="drag-ghost-info">
      <div class="drag-ghost-title">${escapeHtml(title)}</div>
      <div class="drag-ghost-artist">${escapeHtml(artist)}</div>
    </div>
  `;

  document.body.appendChild(ghost);
  return ghost;
};

export const setDragGhost = (e, track) => {
  const ghostEl = createCustomDragGhost(track);
  if (ghostEl && e.dataTransfer && e.dataTransfer.setDragImage) {
    e.dataTransfer.setDragImage(ghostEl, 24, 24);
    setTimeout(() => {
      if (document.body.contains(ghostEl)) {
        document.body.removeChild(ghostEl);
      }
    }, 0);
  }
};
