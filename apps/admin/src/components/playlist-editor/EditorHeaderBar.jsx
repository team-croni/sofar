import React from 'react';
import { Button } from '../ui';
import { Save } from 'lucide-react';
import { usePlaylistEditor } from './PlaylistEditorContext';

export default function EditorHeaderBar() {
  const { isUserType, isNew, isSystem, formData, isSaving, handleSubmit, navigate } = usePlaylistEditor();

  const pageHeadingText = isSystem
    ? `'${formData.title || '장르'}' 실시간 차트 (50곡)`
    : isUserType
      ? `'${formData.title || '유저 공유'}' 상세`
      : (isNew ? '큐레이션 생성' : `'${formData.title || '큐레이션'}' 수정`);

  return (
    <div className="editor-header-bar">
      <div className="editor-header-left">
        <h2 className="editor-page-title">
          {isSystem &&
            <span>
              시스템
            </span>
          }
          {pageHeadingText}
        </h2>
      </div>
      <div className="editor-header-actions">
        {isSystem ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/curations?category=genre')}
          >
            목록으로 돌아가기
          </Button>
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}
