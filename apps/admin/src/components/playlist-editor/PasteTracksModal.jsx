import React from 'react';
import { Modal, Button, Radio } from '../ui';
import { usePlaylistEditor } from './PlaylistEditorContext';

export default function PasteTracksModal() {
  const {
    isPasteModalOpen,
    setIsPasteModalOpen,
    pasteText,
    setPasteText,
    pasteMode,
    setPasteMode,
    parsedPastedTracks,
    handleApplyPaste,
  } = usePlaylistEditor();

  return (
    <Modal
      isOpen={isPasteModalOpen}
      title="텍스트 줄글 일괄 등록"
      onClose={() => setIsPasteModalOpen(false)}
    >
      <p className="modal-desc-text">
        노션, 엑셀, 멜론, 메모장 등에서 복사한 곡 목록 텍스트를 그대로 붙여넣으세요.
        <br />
        <span className="modal-sub-caption">
          자동 파싱 지원: <code>곡제목 - 아티스트</code>, <code>1. 곡제목 - 아티스트</code>, <code>곡제목 (아티스트)</code> 등
        </span>
      </p>

      <textarea
        className="sofar-input-field modal-textarea-custom"
        rows={8}
        placeholder={`1. 주저하는 연인들을 위해 - 잔나비\n2. Seasons - wave to earth\n3. 밤편지 (아이유)\n4. 사건의 지평선 - 윤하`}
        value={pasteText}
        onChange={(e) => setPasteText(e.target.value)}
      />

      <div className="modal-footer-between">
        <div className="modal-paste-options">
          <Radio
            id="paste-mode-append"
            name="pasteMode"
            label="기존 목록 뒤에 추가"
            checked={pasteMode === 'append'}
            onChange={() => setPasteMode('append')}
          />
          <Radio
            id="paste-mode-replace"
            name="pasteMode"
            label="기존 목록 지우고 교체"
            checked={pasteMode === 'replace'}
            onChange={() => setPasteMode('replace')}
          />
        </div>

        <span className={`modal-count-status ${parsedPastedTracks.length > 0 ? 'active' : 'empty'}`}>
          {parsedPastedTracks.length}곡 인식됨
        </span>
      </div>

      <div className="modal-footer-actions">
        <Button variant="secondary" size="sm" onClick={() => setIsPasteModalOpen(false)}>
          취소
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={parsedPastedTracks.length === 0}
          onClick={handleApplyPaste}
        >
          {parsedPastedTracks.length > 0 ? `${parsedPastedTracks.length}곡 일괄 등록 적용` : '등록하기'}
        </Button>
      </div>
    </Modal>
  );
}
