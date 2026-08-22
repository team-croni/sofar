import { isUsableArtwork, thumbnailCache } from './thumbnailCache';

const escapeHtml = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

export const createCustomDragGhost = (track, count = 1) => {
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
    <div class="drag-ghost-cover-wrapper">
      <div class="drag-ghost-cover">
        ${artworkSrc ? `<img src="${escapeHtml(artworkSrc)}" class="drag-ghost-img" />` : `<div class="drag-ghost-placeholder">🎵</div>`}
      </div>
      ${count > 1 ? `<span class="drag-ghost-count-badge">${count}</span>` : ''}
    </div>
    <div class="drag-ghost-info">
      <div class="drag-ghost-title">${escapeHtml(title || '제목 없음')}</div>
      <div class="drag-ghost-artist">${count > 1 ? `${escapeHtml(artist || '아티스트')} · ${count}곡` : escapeHtml(artist || '아티스트 미상')}</div>
    </div>
  `;
  
  document.body.appendChild(ghost);
  return ghost;
};

export const createArtistDragGhost = (artistItem) => {
  const ghost = document.createElement('div');
  ghost.className = 'custom-drag-ghost artist-drag-ghost';
  
  const name = artistItem.name || '아티스트';
  const trackCount = artistItem.tracks?.length || 1;
  const thumbnail = artistItem.thumbnail;

  ghost.innerHTML = `
    <div class="drag-ghost-cover-wrapper">
      <div class="drag-ghost-cover is-artist-cover">
        ${thumbnail ? `<img src="${escapeHtml(thumbnail)}" class="drag-ghost-img is-artist-img" />` : `<div class="drag-ghost-placeholder">👤</div>`}
      </div>
      ${trackCount > 1 ? `<span class="drag-ghost-count-badge">${trackCount}</span>` : ''}
    </div>
    <div class="drag-ghost-info">
      <div class="drag-ghost-title">${escapeHtml(name)}</div>
      <div class="drag-ghost-artist">${trackCount > 1 ? `음원 ${trackCount}곡` : (artistItem.genre || '아티스트')}</div>
    </div>
  `;
  
  document.body.appendChild(ghost);
  return ghost;
};

let lastMouseDownTarget = null;

if (typeof window !== 'undefined') {
  window.addEventListener(
    'mousedown',
    (e) => {
      lastMouseDownTarget = e.target;
    },
    true
  );
  window.addEventListener(
    'touchstart',
    (e) => {
      lastMouseDownTarget = e.target;
    },
    true
  );
}

export const isInteractiveDragTarget = (e) => {
  const selector = 'button, a, input, select, textarea, .track-actions, .track-action-dropdown, .popular-row__actions, .album-card__actions, .top-result-actions, .dropdown-container, .sofar-dropdown, .btn-delete, [data-no-dnd="true"]';

  const target = e?.target;
  if (target && target.closest && target.closest(selector)) {
    return true;
  }

  const downTarget = lastMouseDownTarget;
  if (downTarget && downTarget.closest && downTarget.closest(selector)) {
    return true;
  }

  return false;
};

export const handleTrackDragStart = (e, track) => {
  if (isInteractiveDragTarget(e)) {
    e.preventDefault();
    e.stopPropagation();
    return;
  }

  const payload = JSON.stringify(track);
  e.dataTransfer.setData('application/json', payload);
  e.dataTransfer.setData('text/plain', payload);
  e.dataTransfer.effectAllowed = 'copyMove';

  const ghostEl = createCustomDragGhost(track);
  if (ghostEl && e.dataTransfer.setDragImage) {
    e.dataTransfer.setDragImage(ghostEl, 0, 0);
    setTimeout(() => {
      if (document.body.contains(ghostEl)) {
        document.body.removeChild(ghostEl);
      }
    }, 0);
  }
};

export const handleArtistDragStart = (e, artistItem) => {
  if (isInteractiveDragTarget(e)) {
    e.preventDefault();
    e.stopPropagation();
    return;
  }

  const payload = JSON.stringify({
    type: 'artist',
    id: artistItem.id,
    name: artistItem.name,
    thumbnail: artistItem.thumbnail,
    genre: artistItem.genre,
    tracks: artistItem.tracks || [],
  });
  e.dataTransfer.setData('application/json', payload);
  e.dataTransfer.setData('text/plain', payload);
  e.dataTransfer.effectAllowed = 'copyMove';

  const ghostEl = createArtistDragGhost(artistItem);
  if (ghostEl && e.dataTransfer.setDragImage) {
    e.dataTransfer.setDragImage(ghostEl, 0, 0);
    setTimeout(() => {
      if (document.body.contains(ghostEl)) {
        document.body.removeChild(ghostEl);
      }
    }, 0);
  }
};

export const extractTracksFromDragData = (data) => {
  if (!data) return [];
  if (Array.isArray(data)) {
    return data.filter(Boolean);
  }
  if (Array.isArray(data.tracks)) {
    return data.tracks.filter(Boolean);
  }
  if (data.youtube_video_id || data.custom_title || data.title) {
    return [data];
  }
  return [];
};
