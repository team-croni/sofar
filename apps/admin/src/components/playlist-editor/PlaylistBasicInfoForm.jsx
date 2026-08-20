import React from 'react';
import { Input, Select, Checkbox } from '../ui';
import { usePlaylistEditor } from './PlaylistEditorContext';

export default function PlaylistBasicInfoForm() {
  const { formData, isUserType, handleChange } = usePlaylistEditor();

  return (
    <div className="editor-section">
      <h3 className="editor-section-title">기본 정보</h3>

      <Input
        label="플레이리스트 제목 *"
        placeholder="예: 비 오는 날 창가 감성 팝"
        value={formData.title}
        onChange={(e) => handleChange('title', e.target.value)}
        required
      />

      <Input
        label="부제목 / 설명"
        placeholder="예: 빗소리와 어울리는 차분한 분위기의 팝 모음"
        value={formData.subtitle}
        onChange={(e) => handleChange('subtitle', e.target.value)}
      />

      <Select
        label="카테고리"
        value={formData.category}
        onChange={(e) => handleChange('category', e.target.value)}
        options={[
          { value: 'theme', label: '테마 (Theme)' },
          { value: 'situation', label: '상황 (Situation)' },
          { value: 'genre', label: '장르 (Genre)' },
        ]}
      />

      <Input
        label="카테고리 라벨"
        placeholder="예: sofar"
        value={formData.category_label}
        onChange={(e) => handleChange('category_label', e.target.value)}
      />

      <Input
        label="커버 이미지 URL"
        placeholder="https://images.unsplash.com/..."
        value={formData.cover}
        onChange={(e) => handleChange('cover', e.target.value)}
      />

      {formData.cover && (
        <div className="cover-preview-wrapper">
          <img
            src={formData.cover}
            alt="미리보기"
            className="cover-preview-img"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
          <span className="cover-preview-caption">커버 이미지 미리보기</span>
        </div>
      )}

      <Input
        label="대표 태그"
        placeholder="예: 발라드, 감성, 빗소리"
        value={formData.tags || ''}
        onChange={(e) => handleChange('tags', e.target.value)}
      />

      <Input
        label={isUserType ? "작성자 (수정 불가)" : "작성자"}
        placeholder="예: sofar"
        value={formData.author}
        onChange={(e) => handleChange('author', e.target.value)}
        disabled={isUserType}
        readOnly={isUserType}
        helperText={isUserType ? "공유 플레이리스트의 작성자 이름은 변경할 수 없습니다." : undefined}
      />

      <div className="editor-active-checkbox-wrapper">
        <Checkbox
          id="is_active_cb"
          checked={formData.is_active}
          onChange={(e) => handleChange('is_active', e.target.checked)}
          label="앱 메인 화면에 즉시 노출 (공개 상태)"
        />
      </div>
    </div>
  );
}
