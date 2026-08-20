import React from 'react';
import { Button } from '../ui';
import { Save } from 'lucide-react';
import { usePlaylistEditor } from './PlaylistEditorContext';

export default function EditorHeaderBar() {
  const { isUserType, isNew, formData, isSaving, handleSubmit, navigate } = usePlaylistEditor();

  const pageHeadingText = isUserType
    ? `'${formData.title || '유저 공유'}' 상세`
    : (isNew ? '큐레이션 생성' : `'${formData.title || '큐레이션'}' 수정`);

  return (
    <div className="editor-header-bar">
      <div className="editor-header-left">
        <h2 className="editor-page-title">{pageHeadingText}</h2>
      </div>
      <div className="editor-header-actions">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => navigate('/curations')}
        >
          취소
        </Button>
        <Button
          variant="primary"
          size="sm"
          leadingIcon={<Save size={14} />}
          loading={isSaving}
          onClick={handleSubmit}
        >
          저장하기
        </Button>
      </div>
    </div>
  );
}
