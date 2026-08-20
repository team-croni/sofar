import React from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AudioProvider, useAudio } from './contexts/AudioContext';
import { FavoriteProvider } from './contexts/FavoriteContext';

import Player from './components/player/Player';
import VinylPlayer from './components/player/VinylPlayer';
import LyricsViewer from './components/lyrics/LyricsViewer';
import PlaylistManager from './components/playlist/PlaylistManager';
import MiniPlayer from './components/player/MiniPlayer';
import LoginPage from './pages/LoginPage';
import PasswordResetPage from './pages/PasswordResetPage';
import LegalPage from './pages/LegalPage';
import HomePanel from './components/home/HomePanel';

import SearchPanel from './components/search/SearchPanel';
import RightHeader from './components/header/RightHeader';

import { thumbnailCache } from './utils/thumbnailCache';
import { Button, Modal, LoadingScreen } from './components/ui';
import './App.css';
import { ThumbsUp, ThumbsDown, Loader2 } from 'lucide-react';

/* ── 공통 글로벌 앱 쉘 (Global App Layout) ──────────── */
function AppShell({ children }) {
  const {
    user,
    loading,
    showMigrationModal,
    executeMigration,
    discardMigration,
  } = useAuth();

  const { toastMessage, currentTrack } = useAudio();

  // 앨범 이미지 URL 구하기
  const getTrackThumbnail = (track) => {
    if (!track) return '';
    const cached = thumbnailCache.get(track.custom_artist, track.custom_title);
    if (cached) return cached;
    if (track.youtube_video_id) {
      return `https://img.youtube.com/vi/${track.youtube_video_id}/hqdefault.jpg`;
    }
    return '';
  };

  if (loading) {
    return <LoadingScreen fullScreen message="sofar를 준비하고 있습니다..." />;
  }

  const bgUrl = getTrackThumbnail(currentTrack);

  return (
    <div className="app-container">
      {/* 실시간 앨범 커버 블러 배경 */}
      {currentTrack && bgUrl && (
        <div 
          key={currentTrack.id}
          className="app-blurred-bg fade-in-bg"
          style={{ backgroundImage: `url(${bgUrl})` }}
        />
      )}

      {/* 페이지 컨텐츠 */}
      {children}

      {/* 글로벌 하단 미니 플레이어 (페이지 이동에도 상시 유지) */}
      <MiniPlayer />

      {/* 데이터 마이그레이션 모달 */}
      <Modal 
        isOpen={showMigrationModal} 
        title="로그인 전에 듣던 음악을 가져올까요?" 
        onClose={discardMigration}
      >
        <p className="migration-modal-desc">
          로그인 전에 담아둔 플레이리스트와 설정을 지금 계정으로 가져와 계속 이어 들으실 수 있어요.
        </p>
        <p className="migration-modal-warning">
          건너뛰기를 선택하시면 로그인 전에 담아둔 음악 목록은 삭제되며 다시 복구할 수 없습니다.
        </p>
        <div className="migration-modal-actions">
          <Button variant="secondary" onClick={discardMigration}>건너뛰기</Button>
          <Button variant="primary" onClick={executeMigration}>가져오기</Button>
        </div>
      </Modal>
    </div>
  );
}

/* ── 메인 대시보드 뷰 (홈 / 검색 / Now Playing) ── */
function HomePage() {
  const { 
    toastMessage, 
    isToastVisible, 
    currentTrack, 
    reportMatchFeedback, 
    hasVotedCurrentTrack, 
    isLyricsExpanded,
    isMatchFeedbackLoading
  } = useAudio();
  const location = useLocation();
  const contentRef = React.useRef(null);
  const isSearchPage = location.pathname === '/search';
  const isNowPlayingPage = location.pathname === '/now' || location.pathname === '/now-playing';
  const hasBottomPlayer = Boolean(currentTrack || isNowPlayingPage);

  // 홈, 검색 등 페이지 경로(pathname) 이동 시에만 스크롤을 최상단으로 초기화 (쿼리 변경 시에는 스크롤 유지)
  React.useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const renderRightPanelContent = () => {
    if (isSearchPage) {
      return <SearchPanel />;
    }
    if (isNowPlayingPage) {
      return (
        <div className="now-playing-container">
          <VinylPlayer />
          <LyricsViewer />
        </div>
      );
    }
    return <HomePanel />;
  };

  return (
    <main className="app-main">
      <div className="left-panel-column">
        <PlaylistManager />
      </div>
      <div className="right-panel-column">
        <RightHeader />
        <div 
          ref={contentRef}
          className={`right-main-content scrollbar-none ${!isNowPlayingPage ? 'is-full-view' : ''} ${isNowPlayingPage ? 'is-now-playing-view' : ''}`}
        >
          {renderRightPanelContent()}

          {/* 알림 토스트 (right-main-content 기준 위치) */}
          <div className={`toast ${hasBottomPlayer ? 'has-player' : 'no-player'} ${isToastVisible ? 'show' : ''}`}>
            {toastMessage}
          </div>
        </div>

        {/* 노래 일치 여부 매칭 피드백 (right-panel-column 기준 고정 플로팅 캡슐) */}
        {isNowPlayingPage && !isLyricsExpanded && currentTrack && (!hasVotedCurrentTrack || isMatchFeedbackLoading) && (
          <div className={`main-match-feedback ${isMatchFeedbackLoading ? 'is-loading' : ''}`} title="노래 일치 여부 피드백">
            {isMatchFeedbackLoading ? (
              <span className="main-match-label match-loading-text">
                <Loader2 size={13} className="match-spin-icon" /> 다른 영상으로 매칭 중...
              </span>
            ) : (
              <>
                <span className="main-match-label">노래가 일치하나요?</span>
                <div className="main-match-buttons">
                  <button
                    onClick={() => reportMatchFeedback(true)}
                    disabled={isMatchFeedbackLoading}
                    className="main-match-btn match-correct"
                    title="원곡 음원이 맞아요 (긍정 평가)"
                  >
                    <ThumbsUp size={12} /> 네
                  </button>
                  <button
                    onClick={() => reportMatchFeedback(false)}
                    disabled={isMatchFeedbackLoading}
                    className="main-match-btn match-incorrect"
                    title="원곡 음원이 아니에요 (서버 반영 및 다음 순위 영상으로 즉시 교체)"
                  >
                    <ThumbsDown size={12} /> 아니요
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        <Player />
      </div>
    </main>
  );
}

/* ── 루트 앱 (Providers + Routes) ───────────────── */
export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  React.useEffect(() => {
    if (window.location.hash === '#') {
      window.history.replaceState(
        null,
        document.title,
        window.location.pathname + window.location.search
      );
    }
  }, []);

  // 글로벌 키보드 단축키 지원 (어디서든 '/' 또는 'Cmd+K' / 'Ctrl+K' 입력 시 검색 페이지로 이동 및 검색창 포커스)
  React.useEffect(() => {
    const handleKeyDown = (e) => {
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      const isEditable = document.activeElement?.isContentEditable;
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select' || isEditable) {
        return;
      }

      if (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        if (location.pathname !== '/search') {
          navigate('/search');
        }
        setTimeout(() => {
          const searchInput = document.getElementById('search-input');
          if (searchInput) {
            searchInput.focus();
            searchInput.select?.();
          }
        }, 50);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [location.pathname, navigate]);

  return (
    <AuthProvider>
      <AudioProvider>
        <FavoriteProvider>
          <Routes>
            {/* 메인 홈 페이지, 검색 페이지 및 Now Playing 페이지 */}
            <Route path="/" element={<AppShell><HomePage /></AppShell>} />
            <Route path="/home" element={<AppShell><HomePage /></AppShell>} />
            <Route path="/search" element={<AppShell><HomePage /></AppShell>} />
            <Route path="/now" element={<AppShell><HomePage /></AppShell>} />
            <Route path="/now-playing" element={<Navigate to="/now" replace />} />

            {/* 인증 페이지 */}
            <Route path="/login"  element={<LoginPage />} />
            <Route path="/signup" element={<LoginPage />} />
            <Route path="/reset-password" element={<PasswordResetPage />} />

            {/* 법적 고지, 이용약관 및 개인정보 처리방침 */}
            <Route path="/terms" element={<LegalPage defaultTab="terms" />} />
            <Route path="/privacy" element={<LegalPage defaultTab="privacy" />} />
            <Route path="/legal" element={<LegalPage defaultTab="terms" />} />

            {/* 나머지 경로는 / 로 리다이렉트 */}
            <Route path="*" element={<Navigate to="/" replace />} />

          </Routes>
        </FavoriteProvider>
      </AudioProvider>
    </AuthProvider>
  );
}
