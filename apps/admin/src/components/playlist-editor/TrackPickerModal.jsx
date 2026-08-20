import React from 'react';
import { Modal, Button, Select, Checkbox } from '../ui';
import { Loader2, Music } from 'lucide-react';
import { usePlaylistEditor } from './PlaylistEditorContext';

export default function TrackPickerModal() {
  const {
    isPickerModalOpen,
    setIsPickerModalOpen,
    pickerTab,
    setPickerTab,
    isPopularLoading,
    popularTracks,
    existingPlaylists,
    selectedPlaylistId,
    selectedPlaylistTracks,
    checkedPickerTracks,
    setCheckedPickerTracks,
    handleSelectPlaylistToView,
    toggleCheckPickerTrack,
    toggleAllPickerTracks,
    handleApplyPickerSelection,
  } = usePlaylistEditor();

  return (
    <Modal
      isOpen={isPickerModalOpen}
      title="인기 차트 / 기존 플레이리스트에서 곡 가져오기"
      onClose={() => {
        setIsPickerModalOpen(false);
        setCheckedPickerTracks(new Set());
      }}
    >
      <div className="picker-tabs-row">
        <button
          type="button"
          className={`picker-tab-btn ${pickerTab === 'popular' ? 'active' : ''}`}
          onClick={() => {
            setPickerTab('popular');
            setCheckedPickerTracks(new Set());
          }}
        >
          🔥 실시간 인기 음원 Top 50
        </button>
        <button
          type="button"
          className={`picker-tab-btn ${pickerTab === 'playlists' ? 'active' : ''}`}
          onClick={() => {
            setPickerTab('playlists');
            setCheckedPickerTracks(new Set());
          }}
        >
          📚 기존 큐레이션 플레이리스트
        </button>
      </div>

      {pickerTab === 'popular' ? (
        <div>
          <div className="picker-section-header">
            <span className="picker-section-caption">가장 많이 재생되고 큐레이팅된 수록곡 추천</span>
            {popularTracks.length > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => toggleAllPickerTracks(popularTracks)}
              >
                전체 선택 / 해제
              </Button>
            )}
          </div>

          {isPopularLoading ? (
            <div className="picker-loading-container">
              <Loader2 size={24} className="animate-spin" />
              <p className="picker-loading-text">인기 곡 불러오는 중...</p>
            </div>
          ) : (
            <div className="picker-scroll-list scrollbar-none">
              {popularTracks.map((t, idx) => {
                const trackKey = `${t.title || t.custom_title}-${t.artist || t.custom_artist}-${idx}`;
                const isChecked = checkedPickerTracks.has(trackKey);
                const thumbUrl = t.thumbnail || t.cover || t.cover_url || (t.youtube_video_id || t.youtubeId ? `https://img.youtube.com/vi/${t.youtube_video_id || t.youtubeId}/hqdefault.jpg` : '');

                return (
                  <div
                    key={idx}
                    className={`picker-track-card ${isChecked ? 'is-selected' : ''}`}
                    onClick={() => toggleCheckPickerTrack(trackKey)}
                  >
                    <Checkbox
                      id={`picker-popular-cb-${idx}`}
                      checked={isChecked}
                      onChange={() => {}}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="picker-track-cover">
                      {thumbUrl ? (
                        <img src={thumbUrl} alt="" onError={(e) => { e.target.style.display = 'none'; }} />
                      ) : (
                        <Music size={16} className="empty-state-icon" />
                      )}
                    </div>
                    <div className="picker-track-info">
                      <div className="picker-track-title">{t.title || t.custom_title}</div>
                      <div className="picker-track-artist">{t.artist || t.custom_artist}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="picker-select-box-wrapper">
            <label className="picker-select-label-text">가져올 기존 큐레이션 선택</label>
            <Select
              value={selectedPlaylistId}
              onChange={(e) => handleSelectPlaylistToView(e.target.value)}
              options={[
                { value: '', label: '-- 큐레이션 선택 --' },
                ...existingPlaylists.map((p) => ({ value: p.id, label: `[${p.category || '큐레이션'}] ${p.title} (${(p.tracks || []).length}곡)` })),
              ]}
            />
          </div>

          {selectedPlaylistId && (
            <div>
              <div className="picker-section-header">
                <span className="picker-section-caption">수록곡 목록 ({selectedPlaylistTracks.length}곡)</span>
                {selectedPlaylistTracks.length > 0 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => toggleAllPickerTracks(selectedPlaylistTracks)}
                  >
                    전체 선택 / 해제
                  </Button>
                )}
              </div>

              <div className="picker-scroll-list-sm scrollbar-none">
                {selectedPlaylistTracks.map((t, idx) => {
                  const trackKey = `${t.title || t.custom_title}-${t.artist || t.custom_artist}-${idx}`;
                  const isChecked = checkedPickerTracks.has(trackKey);
                  const thumbUrl = t.thumbnail || t.cover || t.cover_url || (t.youtube_video_id || t.youtubeId ? `https://img.youtube.com/vi/${t.youtube_video_id || t.youtubeId}/hqdefault.jpg` : '');

                  return (
                    <div
                      key={idx}
                      className={`picker-track-card ${isChecked ? 'is-selected' : ''}`}
                      onClick={() => toggleCheckPickerTrack(trackKey)}
                    >
                      <Checkbox
                        id={`picker-playlist-cb-${idx}`}
                        checked={isChecked}
                        onChange={() => {}}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="picker-track-cover">
                        {thumbUrl ? (
                          <img src={thumbUrl} alt="" onError={(e) => { e.target.style.display = 'none'; }} />
                        ) : (
                          <Music size={16} className="empty-state-icon" />
                        )}
                      </div>
                      <div className="picker-track-info">
                        <div className="picker-track-title">{t.title || t.custom_title}</div>
                        <div className="picker-track-artist">{t.artist || t.custom_artist}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="modal-footer-actions">
        <Button variant="secondary" size="sm" onClick={() => setIsPickerModalOpen(false)}>
          취소
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={checkedPickerTracks.size === 0}
          onClick={handleApplyPickerSelection}
        >
          {checkedPickerTracks.size > 0 ? `${checkedPickerTracks.size}개 곡 큐레이션에 추가` : '선택 추가'}
        </Button>
      </div>
    </Modal>
  );
}
