import React from 'react';
import { Modal, Button } from '../ui';
import { usePlaylistEditor } from './PlaylistEditorContext';

export default function LinkImportModal() {
  const {
    isLinkImportModalOpen,
    setIsLinkImportModalOpen,
    linkImportText,
    setLinkImportText,
    isImportingLinks,
    handleApplyLinkImport,
  } = usePlaylistEditor();

  return (
    <Modal
      isOpen={isLinkImportModalOpen}
      title="유튜브 / URL 플레이리스트 가져오기"
      onClose={() => setIsLinkImportModalOpen(false)}
    >
      <p className="modal-desc-text">
        유튜브 플레이리스트 URL 또는 영상 링크들을 입력 창에 붙여넣으세요.<br />
        <span className="modal-sub-caption">
          예시: <code>https://www.youtube.com/watch?v=dQ...</code>, <code>https://youtu.be/3tmd...</code>
        </span>
      </p>

      <textarea
        className="sofar-input-field modal-textarea-custom"
        rows={7}
        placeholder={`https://www.youtube.com/watch?v=dQw4w9WgXcQ\nhttps://youtu.be/3tmd-ClpJxA`}
        value={linkImportText}
        onChange={(e) => setLinkImportText(e.target.value)}
      />

      <div className="modal-footer-actions">
        <Button variant="secondary" size="sm" onClick={() => setIsLinkImportModalOpen(false)}>
          취소
        </Button>
        <Button
          variant="primary"
          size="sm"
          loading={isImportingLinks}
          onClick={handleApplyLinkImport}
        >
          {isImportingLinks ? '분석 중...' : '적용'}
        </Button>
      </div>
    </Modal>
  );
}
