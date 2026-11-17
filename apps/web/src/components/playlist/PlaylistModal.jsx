import React, { useState, useEffect } from 'react';
import { Music, Wallpaper, ListMusic, RotateCcw } from 'lucide-react';
import { Modal, Button, Input } from '../ui';
import { NowPlayingThemeControls, NowPlayingThemePreview } from './NowPlayingThemeEditor';
import ImageSearchPicker from '../common/ImageSearchPicker';
import {
  getPlaylistTheme,
  normalizeTheme,
  hasCustomTheme,
  THEME_EFFECTS,
  THEME_INTENSITIES,
} from '../../utils/nowPlayingTheme';
import './PlaylistEditor.css';

export const PLAYLIST_COVER_PRESETS = [
  { label: '자동', url: '' },
  { label: '봄 감성', url: 'https://images.unsplash.com/photo-1490750967868-88aa4486c946?auto=format&fit=crop&w=500&q=80' },
  { label: '밤 산책', url: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=500&q=80' },
  { label: '로파이', url: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?auto=format&fit=crop&w=500&q=80' },
  { label: '카페 라운지', url: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=500&q=80' },
  { label: '여름 바다', url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=500&q=80' },
  { label: '비 오는 날', url: 'https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?auto=format&fit=crop&w=500&q=80' }
];

// 커버 이미지 검색 키워드 (한국어 라벨 → 영어 검색어)
const COVER_SEARCH_KEYWORDS = [
  { label: '감성', query: 'aesthetic' },
  { label: '하늘', query: 'sky clouds' },
  { label: '꽃', query: 'flowers' },
  { label: '바다', query: 'ocean' },
  { label: '카페', query: 'coffee cafe' },
  { label: '야경', query: 'city lights night' },
  { label: '노을', query: 'sunset' },
  { label: 'LP', query: 'vinyl record' },
];

const TABS = [
  { id: 'info', label: '기본 정보', icon: <ListMusic size={15} /> },
  { id: 'theme', label: 'Now Playing 커스텀', icon: <Wallpaper size={15} /> },
];

/**
 * 플레이리스트 생성 / 편집 모달
 * - 상단 탭: 기본 정보 / Now Playing 커스텀
 * - 왼쪽: 항상 보이는 실시간 미리보기 / 오른쪽: 설정 (오른쪽만 스크롤)
 * - 하단 고정: 취소 / 저장
 */
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
  const [theme, setTheme] = useState(() => normalizeTheme(null));
  const [activeTab, setActiveTab] = useState('info');

  useEffect(() => {
    if (isOpen) {
      if (isEdit && initialPlaylist) {
        setTitle(initialPlaylist.title || '');
        setCoverUrl(initialPlaylist.cover_url || initialPlaylist.cover || '');
        setTheme(getPlaylistTheme(initialPlaylist));
      } else {
        setTitle('');
        setCoverUrl('');
        setTheme(normalizeTheme(null));
      }
      setActiveTab('info');
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
        cover_url: coverUrl.trim(),
        now_playing_theme: normalizeTheme(theme)
      });
      onClose();
    } catch (err) {
      console.error('Playlist modal submit error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderCover = () => {
    if (coverUrl.trim()) {
      return (
        <div className="folder-tile-cover custom-cover">
          <img
            key={coverUrl}
            src={coverUrl.trim()}
            alt="커버 미리보기"
            className="folder-custom-cover-img"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>
      );
    }

    if (render2x2Cover) {
      return render2x2Cover(initialPlaylist, { ignoreCustomCover: true });
    }

    return (
      <div className="folder-tile-cover">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="folder-tile-cell empty">
            <Music size={14} className="empty-cell-icon" />
          </div>
        ))}
      </div>
    );
  };

  const effectLabel = THEME_EFFECTS.find((e) => e.value === theme.effect)?.label || '없음';
  const intensityLabel = THEME_INTENSITIES.find((i) => i.value === theme.intensity)?.label || '';
  // 비네트·흑백은 직접 고른 배경에만 적용되므로 배경이 있을 때만 표시
  const backgroundEffectsLabel = [
    theme.background && theme.vignette && '비네트',
    theme.background && theme.grayscale && '흑백',
    theme.grain && '필름 질감',
  ].filter(Boolean).join(' · ') || '없음';

  return (
    <Modal
      isOpen={isOpen}
      title={isEdit ? '플레이리스트 편집' : '새 플레이리스트'}
      onClose={onClose}
      size="xl"
      className="pe-modal"
      footer={
        <div className="pe-footer">
          <Button variant="secondary" type="button" onClick={onClose}>
            취소
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="playlist-modal-form"
            disabled={!title.trim() || isSubmitting}
          >
            {isEdit ? '저장' : '만들기'}
          </Button>
        </div>
      }
    >
      <form id="playlist-modal-form" className="pe-form" onSubmit={handleSubmit}>
        {/* 상단 탭 */}
        <div className="pe-tabs" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`pe-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        <div className="pe-layout">
          {/* 왼쪽: 실시간 미리보기 (스크롤되지 않음) */}
          <aside className="pe-preview">
            <span className="pe-preview-label">미리보기</span>

            {activeTab === 'info' ? (
              <>
                <div className="pe-cover-preview folder-card-cover-wrapper">
                  {renderCover()}
                </div>
                <div className="pe-preview-meta">
                  <p className={`pe-preview-title ${title.trim() ? '' : 'is-placeholder'}`}>
                    {title.trim() || '플레이리스트 이름'}
                  </p>
                  <p className="pe-preview-sub">
                    {coverUrl.trim() ? '직접 고른 커버' : '기본 2x2 앨범 커버'}
                  </p>
                </div>
                {coverUrl.trim() && (
                  <button type="button" className="pe-reset-btn" onClick={() => setCoverUrl('')}>
                    <RotateCcw size={12} />
                    기본 커버로 되돌리기
                  </button>
                )}
              </>
            ) : (
              <>
                <NowPlayingThemePreview theme={theme} coverUrl={coverUrl} title={title} />
                <dl className="pe-summary">
                  <div>
                    <dt>배경</dt>
                    <dd>{theme.background ? '직접 고른 이미지' : '곡 앨범 커버'}</dd>
                  </div>
                  <div>
                    <dt>효과</dt>
                    <dd>{theme.effect === 'none' ? '없음' : `${effectLabel} · ${intensityLabel}`}</dd>
                  </div>
                  <div>
                    <dt>배경 효과</dt>
                    <dd>{backgroundEffectsLabel}</dd>
                  </div>
                </dl>
                <p className="pe-preview-hint">
                  이 플레이리스트를 재생하는 동안 Now Playing 화면에 적용됩니다.
                </p>
                {hasCustomTheme(theme) && (
                  <button type="button" className="pe-reset-btn" onClick={() => setTheme(normalizeTheme(null))}>
                    <RotateCcw size={12} />
                    커스텀 초기화
                  </button>
                )}
              </>
            )}
          </aside>

          {/* 오른쪽: 설정 (이 영역만 스크롤) */}
          <div className="pe-controls scrollbar-none" key={activeTab}>
            {activeTab === 'info' ? (
              <>
                <section className="pe-section">
                  <label className="pe-section-title" htmlFor="pe-title-input">이름</label>
                  <Input
                    id="pe-title-input"
                    autoFocus
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="플레이리스트 이름을 입력하세요"
                  />
                </section>

                <section className="pe-section">
                  <div className="pe-section-head">
                    <span className="pe-section-title">커버 이미지</span>
                    <span className="pe-section-desc">선택하지 않으면 담긴 곡 4개의 앨범으로 자동 구성됩니다.</span>
                  </div>
                  <ImageSearchPicker
                    value={coverUrl}
                    onChange={setCoverUrl}
                    presets={PLAYLIST_COVER_PRESETS}
                    keywords={COVER_SEARCH_KEYWORDS}
                    aspect="square"
                    emptyLabel="자동"
                  />
                </section>
              </>
            ) : (
              <NowPlayingThemeControls theme={theme} onChange={setTheme} />
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
}
