import React from 'react';
import { Loader2 } from 'lucide-react';
import AdminLayout from '../AdminLayout';
import { usePlaylistEditor } from './PlaylistEditorContext';

import EditorHeaderBar from './EditorHeaderBar';
import PlaylistBasicInfoForm from './PlaylistBasicInfoForm';
import PlaylistTrackListSection from './PlaylistTrackListSection';
import PasteTracksModal from './PasteTracksModal';
import LinkImportModal from './LinkImportModal';
import TrackDetailModal from './TrackDetailModal';

export default function PlaylistEditorContent() {
  const {
    isLoading,
    isNew,
    isUserType,
    formData,
    handleSubmit,
  } = usePlaylistEditor();

  const pageBreadcrumbText = isUserType ? '유저 공유 상세' : (isNew ? '큐레이션 생성' : '큐레이션 수정');
  const activeTab = isNew ? 'new' : (isUserType ? 'user_shared' : (formData.category || 'all'));

  return (
    <AdminLayout
      pageTitle={pageBreadcrumbText}
      activeTab={activeTab}
    >
      {isLoading ? (
        <div className="empty-state editor-full-loading" style={{ minHeight: '400px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <Loader2 size={32} className="animate-spin-slow" />
          <p className="editor-loading-msg" style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>플레이리스트 데이터를 불러오는 중...</p>
        </div>
      ) : (
        <>
          <EditorHeaderBar />

          <form onSubmit={handleSubmit} className="editor-container">
            <div className="editor-grid">
              <PlaylistBasicInfoForm />
              <PlaylistTrackListSection />
            </div>
          </form>
        </>
      )}

      <PasteTracksModal />
      <LinkImportModal />
      <TrackDetailModal />
    </AdminLayout>
  );
}

