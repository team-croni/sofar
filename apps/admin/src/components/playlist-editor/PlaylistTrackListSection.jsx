import React from 'react';
import { Button } from '../ui';
import { Link, ClipboardPaste, Music } from 'lucide-react';
import { usePlaylistEditor } from './PlaylistEditorContext';
import TrackSearchBar from './TrackSearchBar';
import TrackItemCard from './TrackItemCard';

export default function PlaylistTrackListSection() {
  const {
    formData,
    isDragOverDropZone,
    setIsDragOverDropZone,
    setDropTargetIndex,
    draggingTrackIndex,
    handleDropTrack,
    setIsPickerModalOpen,
    setIsLinkImportModalOpen,
    setIsPasteModalOpen,
  } = usePlaylistEditor();

  return (
    <div
      className={`editor-section ${isDragOverDropZone ? 'drag-over-active' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = draggingTrackIndex !== null ? 'move' : 'copy';
        if (!isDragOverDropZone) setIsDragOverDropZone(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setIsDragOverDropZone(false);
          setDropTargetIndex(null);
        }
      }}
      onDrop={(e) => handleDropTrack(e)}
    >
      <div className="editor-section-header">
        <h3 className="editor-section-title-text">수록곡 목록 ({formData.tracks.length}곡)</h3>
        <div className="editor-header-actions">
          <Button
            variant="secondary"
            size="sm"
            leadingIcon={<Link size={14} />}
            onClick={() => setIsLinkImportModalOpen(true)}
          >
            유튜브/URL 가져오기
          </Button>
          <Button
            variant="secondary"
            size="sm"
            leadingIcon={<ClipboardPaste size={14} />}
            onClick={() => setIsPasteModalOpen(true)}
          >
            텍스트 일괄 붙여넣기
          </Button>
        </div>
      </div>

      {/* 실시간 수록곡 검색 바 */}
      <TrackSearchBar />

      {formData.tracks.length === 0 ? (
        <div className="empty-state editor-tracks-empty">
          <Music size={32} className="editor-tracks-empty-icon" />
          <p className="editor-tracks-empty-title">아직 수록곡이 없습니다.</p>
        </div>
      ) : (
        <div className="editor-tracks-container">
          {formData.tracks.map((track, idx) => (
            <TrackItemCard key={track.id || idx} track={track} idx={idx} />
          ))}
        </div>
      )}
    </div>
  );
}
