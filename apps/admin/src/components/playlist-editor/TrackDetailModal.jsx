import React from 'react';
import { Modal, Button } from '../ui';
import { Music, ExternalLink, Trash2 } from 'lucide-react';
import { usePlaylistEditor } from './PlaylistEditorContext';

export default function TrackDetailModal(props) {
  // PlaylistEditorContext may not exist when rendered on Dashboard
  let contextValues = {};
  try {
    contextValues = usePlaylistEditor() || {};
  } catch (e) {
    contextValues = {};
  }

  const {
    selectedTrackDetail: ctxTrackDetail,
    setSelectedTrackDetail: ctxSetSelectedTrackDetail,
    handleTrackChange: ctxHandleTrackChange,
    handleRemoveTrack: ctxHandleRemoveTrack,
  } = contextValues;

  // Use props if provided, otherwise fallback to context
  const isControlled = props.track !== undefined || props.isOpen !== undefined;

  const isOpen = isControlled ? Boolean(props.isOpen) : Boolean(ctxTrackDetail);
  const track = isControlled ? props.track : ctxTrackDetail?.track;
  const trackIndex = isControlled ? props.index : ctxTrackDetail?.index;

  const handleClose = () => {
    if (props.onClose) {
      props.onClose();
    } else if (ctxSetSelectedTrackDetail) {
      ctxSetSelectedTrackDetail(null);
    }
  };

  const handleChange = (field, value) => {
    if (props.onTrackChange) {
      props.onTrackChange(field, value);
    } else if (ctxHandleTrackChange && trackIndex !== undefined) {
      if (ctxSetSelectedTrackDetail) {
        ctxSetSelectedTrackDetail((prev) => ({
          ...prev,
          track: { ...prev.track, [field]: value },
        }));
      }
      ctxHandleTrackChange(trackIndex, field, value);
    }
  };

  const handleDelete = () => {
    if (props.onDelete) {
      props.onDelete();
      handleClose();
    } else if (ctxHandleRemoveTrack && trackIndex !== undefined) {
      ctxHandleRemoveTrack(trackIndex);
      handleClose();
    }
  };

  const showDelete = Boolean(props.onDelete || (!isControlled && ctxHandleRemoveTrack));

  if (!isOpen || !track) return null;

  return (
    <Modal
      isOpen={isOpen}
      title="노래 상세 정보"
      onClose={handleClose}
    >
      <div className="detail-modal-layout">
        {/* 유튜브 비디오 / 커버 미리보기 */}
        <div className="detail-modal-preview-container">
          {track.youtube_video_id ? (
            <iframe
              src={`https://www.youtube.com/embed/${track.youtube_video_id}?autoplay=0`}
              title={track.custom_title || track.title}
              className="detail-modal-preview-iframe"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <div className="autocomplete-empty">
              <Music size={40} className="empty-state-icon" />
              <span>YouTube ID 미지정 (첫 재생 시 자동 매칭)</span>
            </div>
          )}
        </div>

        {/* 곡 메타데이터 */}
        <div className="detail-modal-fields-form">
          <div>
            <label className="picker-select-label-text">곡 제목</label>
            <input
              type="text"
              className="sofar-input-field"
              value={track.custom_title || track.title || ''}
              readOnly={!props.onTrackChange && isControlled}
              onChange={(e) => handleChange('custom_title', e.target.value)}
            />
          </div>

          <div>
            <label className="picker-select-label-text">아티스트</label>
            <input
              type="text"
              className="sofar-input-field"
              value={track.custom_artist || track.artist || ''}
              readOnly={!props.onTrackChange && isControlled}
              onChange={(e) => handleChange('custom_artist', e.target.value)}
            />
          </div>

          <div>
            <label className="picker-select-label-text">YouTube Video ID</label>
            <div className="detail-modal-yt-actions">
              <input
                type="text"
                className="sofar-input-field"
                placeholder="비디오 ID (예: dQw4w9WgXcQ)"
                value={track.youtube_video_id || ''}
                readOnly={!props.onTrackChange && isControlled}
                onChange={(e) => handleChange('youtube_video_id', e.target.value)}
              />
              {track.youtube_video_id && (
                <Button
                  variant="secondary"
                  size="md"
                  className="detail-modal-yt-btn"
                  onClick={() => window.open(`https://www.youtube.com/watch?v=${track.youtube_video_id}`, '_blank')}
                  title="새 탭에서 유튜브 영상 보기"
                  leadingIcon={<ExternalLink size={14} />}
                >
                  영상 보기
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* 하단 모달 액션 버튼 */}
        <div className={showDelete ? "modal-footer-between" : "modal-footer-end"}>
          {showDelete && (
            <Button
              variant="danger"
              size="sm"
              leadingIcon={<Trash2 size={14} />}
              onClick={handleDelete}
            >
              이 곡 삭제
            </Button>
          )}
          <Button
            variant="primary"
            size="sm"
            onClick={handleClose}
          >
            확인
          </Button>
        </div>
      </div>
    </Modal>
  );
}
