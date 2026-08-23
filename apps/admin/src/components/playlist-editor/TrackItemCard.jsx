import React from 'react';
import { Button, YoutubeIcon } from '../ui';
import { GripVertical, Music, Sparkles, Trash2 } from 'lucide-react';
import { usePlaylistEditor } from './PlaylistEditorContext';
import { setDragGhost } from '../../utils/dragUtils';

export default function TrackItemCard({ track, idx }) {
  const {
    formData,
    dropTargetIndex,
    setDraggingTrackIndex,
    setDropTargetIndex,
    setIsDragOverDropZone,
    handleTrackDragOver,
    handleDropTrack,
    setSelectedTrackDetail,
    handleRemoveTrack,
  } = usePlaylistEditor();

  const isTargetAbove = dropTargetIndex === idx;
  const isTargetBelow = dropTargetIndex === idx + 1 && idx === formData.tracks.length - 1;
  const thumbUrl = track.thumbnail || track.cover || track.cover_url || (track.youtube_video_id
    ? `https://img.youtube.com/vi/${track.youtube_video_id}/hqdefault.jpg`
    : '');

  return (
    <div
      className={`track-item-card ${isTargetAbove ? 'drop-target-above' : ''} ${isTargetBelow ? 'drop-target-below' : ''}`}
      onDragOver={(e) => handleTrackDragOver(e, idx)}
      onDrop={(e) => handleDropTrack(e)}
    >
      <div
        className="card-drag-handle"
        title="드래그하여 순서 변경"
        draggable="true"
        onDragStart={(e) => {
          e.stopPropagation();
          const dragData = {
            type: 'reorder-track',
            fromIndex: idx,
          };
          e.dataTransfer.setData('application/json', JSON.stringify(dragData));
          e.dataTransfer.setData('text/plain', JSON.stringify(dragData));
          e.dataTransfer.effectAllowed = 'copyMove';
          setDraggingTrackIndex(idx);
          setDragGhost(e, track);
        }}
        onDragEnd={() => {
          setDraggingTrackIndex(null);
          setDropTargetIndex(null);
          setIsDragOverDropZone(false);
        }}
      >
        <GripVertical size={16} />
      </div>
      <div className="track-number">{idx + 1}</div>

      <div
        className="track-card-content"
        onClick={() => setSelectedTrackDetail({ track, index: idx })}
        title="클릭하여 노래 상세 정보 보기"
      >
        <div className="track-card-cover">
          {thumbUrl ? (
            <img src={thumbUrl} alt="" onError={(e) => { e.target.style.display = 'none'; }} />
          ) : (
            <Music size={18} className="empty-state-icon" />
          )}
        </div>

        <div className="track-card-info-group">
          <div className="track-card-title">{track.custom_title || '제목 없음'}</div>
          <div className="track-card-artist">{track.custom_artist || '아티스트 없음'}</div>
        </div>
      </div>

      <Button
        variant="danger"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          handleRemoveTrack(idx);
        }}
        title="곡 삭제"
        leadingIcon={<Trash2 size={14} />}
      />
    </div>
  );
}
