import React, { useState, useEffect } from 'react';
import { Music } from 'lucide-react';
import { Modal, Button, Input } from '../ui';

export const PLAYLIST_COVER_PRESETS = [
  { label: '기본 2x2', url: '' },
  { label: '봄 감성', url: 'https://images.unsplash.com/photo-1490750967868-88aa4486c946?auto=format&fit=crop&w=500&q=80' },
  { label: '밤 산책', url: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=500&q=80' },
  { label: '로파이', url: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?auto=format&fit=crop&w=500&q=80' },
  { label: '카페 라운지', url: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=500&q=80' },
  { label: '여름 바다', url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=500&q=80' },
  { label: '비 오는 날', url: 'https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?auto=format&fit=crop&w=500&q=80' }
];

export default function PlaylistModal({
  isOpen,
  onClose,
  mode = 'create', // 'create' | 'edit'
  initialPlaylist = null,
  onSubmit,
  render2x2Cover
}) {
  const isEdit = mode === 'edit';
  const [title, setTitle] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (isEdit && initialPlaylist) {
        setTitle(initialPlaylist.title || '');
        setCoverUrl(initialPlaylist.cover_url || initialPlaylist.cover || '');
      } else {
        setTitle('');
        setCoverUrl('');
      }
      setIsSubmitting(false);
    }
  }, [isOpen, isEdit, initialPlaylist]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || isSubmitting) return;

    try {
      setIsSubmitting(true);
      await onSubmit({
        title: title.trim(),
        cover_url: coverUrl.trim()
      });
      onClose();
    } catch (err) {
      console.error('Playlist modal submit error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderPreview = () => {
    if (coverUrl.trim()) {
      return (
        <div className="folder-tile-cover custom-cover">
          <img 
            src={coverUrl.trim()} 
            alt="Cover Preview" 
            className="folder-custom-cover-img" 
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>
      );
    }

    if (render2x2Cover) {
      return render2x2Cover(initialPlaylist);
    }

    const slots = [0, 1, 2, 3];
    return (
      <div className="folder-tile-cover">
        {slots.map((index) => (
          <div key={index} className="folder-tile-cell empty">
            <Music size={14} className="empty-cell-icon" />
          </div>
        ))}
      </div>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      title={isEdit ? '플레이리스트 정보 수정' : '새 플레이리스트 생성'}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit}>
        <div className="modal-form-content">
          {/* 썸네일 미리보기 영역 */}
          <div className="playlist-cover-edit-preview-wrapper">
            <div className="folder-card-cover-wrapper modal-cover-preview">
              {renderPreview()}
            </div>
            <p className="playlist-cover-hint-text">
              {coverUrl.trim() ? '커스텀 썸네일' : (isEdit ? '2x2 타일 모드' : '2x2 타일 모드')}
            </p>
          </div>

          <div className="modal-field-group">
            <label className="modal-field-label">플레이리스트 이름</label>
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="플레이리스트 이름을 입력하세요"
            />
          </div>

          <div className="modal-field-group">
            <label className="modal-field-label">커버 썸네일 이미지 URL (선택)</label>
            <Input
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              placeholder="https://example.com/cover.jpg (비워두면 기본 2x2)"
            />
          </div>

          {/* 추천 프리셋 썸네일 태그 */}
          <div className="modal-field-group">
            <label className="modal-field-label">추천 썸네일</label>
            <div className="cover-preset-chips">
              {PLAYLIST_COVER_PRESETS.map((preset, pIdx) => (
                <button
                  key={pIdx}
                  type="button"
                  className={`preset-chip-btn ${coverUrl === preset.url ? 'active' : ''}`}
                  onClick={() => setCoverUrl(preset.url)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="modal-action-row">
            <Button
              variant="secondary"
              type="button"
              onClick={onClose}
              className="btn-flex-1"
            >
              취소
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={!title.trim() || isSubmitting}
              className="btn-flex-1"
            >
              {isEdit ? '저장' : '생성'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
