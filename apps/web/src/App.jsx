import React, { useRef, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AudioProvider, useAudio } from './contexts/AudioContext';
import { FavoriteProvider } from './contexts/FavoriteContext';

import Player from './components/player/Player';
import VinylPlayer from './components/player/VinylPlayer';
import LyricsViewer from './components/lyrics/LyricsViewer';
import PlaylistManager from './components/playlist/PlaylistManager';
import SharedPlaylistLinkOpener from './components/playlist/SharedPlaylistLinkOpener';
import MiniPlayer from './components/player/MiniPlayer';
import LoginPage from './pages/LoginPage';
import PasswordResetPage from './pages/PasswordResetPage';
import LegalPage from './pages/LegalPage';
import HomePanel from './components/home/HomePanel';
import NowPlayingBackdrop from './components/nowplaying/NowPlayingBackdrop';
import HideUiToggle from './components/nowplaying/HideUiToggle';
import { useActiveNowPlayingTheme } from './hooks/useActiveNowPlayingTheme';
import { useHideUi } from './hooks/useHideUi';
import { useAccountPreferences } from './hooks/useSettings';

import SearchPanel from './components/search/SearchPanel';
import MyInfoPage from './pages/MyInfoPage';
import SettingsPage from './pages/SettingsPage';
import RightHeader from './components/header/RightHeader';

import { thumbnailCache } from './utils/thumbnailCache';
import { Button, Modal, LoadingScreen, YoutubeIcon, Logo } from './components/ui';
import MobileNoticeScreen from './components/common/MobileNoticeScreen';
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

  const { 
    toastMessage, 
    currentTrack, 
    isPlaying, 
    togglePlay, 
    setShowVideoInVinyl, 
    setVideoVinylState 
  } = useAudio();

  // 계정 설정(공개 기본값·닉네임 표시)을 앱 시작 시 미리 불러와 플레이리스트 생성 등에 반영
  useAccountPreferences();

  const location = useLocation();
  const isNowPlayingRoute = location.pathname === '/now';
  // 설정 · 내 정보 페이지는 재생 중인 곡과 상관없이 단색 배경
  const isSolidBgRoute = location.pathname === '/settings' || location.pathname === '/me';
  const { theme: nowPlayingTheme } = useActiveNowPlayingTheme();
  const { isUiHidden, setUiHidden } = useHideUi();

  // Now Playing 화면을 벗어나면 UI 숨기기 자동 해제
  useEffect(() => {
    if (!isNowPlayingRoute && isUiHidden) setUiHidden(false);
  }, [isNowPlayingRoute, isUiHidden, setUiHidden]);

  // 유튜브 정책 준수: 데스크톱 너비(> 768px)에서 모바일 너비(<= 768px)로 줄어드는 순간 재생 중인 영상 강제 정지 및 비닐 영상 닫기
  const isPlayingRef = useRef(isPlaying);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let wasDesktop = window.innerWidth > 768;

    const handleResize = () => {
      const isMobile = window.innerWidth <= 768;
      // 데스크톱 너비였다가 모바일 너비(768px 이하)로 줄어든 순간
      if (wasDesktop && isMobile) {
        if (isPlayingRef.current) {
          togglePlay();
        }
        if (setShowVideoInVinyl) {
          setShowVideoInVinyl(false);
        }
        if (setVideoVinylState) {
          setVideoVinylState('idle');
        }
      }
      wasDesktop = !isMobile;
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [togglePlay, setShowVideoInVinyl, setVideoVinylState]);

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
    return <LoadingScreen fullScreen message="Loading" />;
  }

  const bgUrl = getTrackThumbnail(currentTrack);
  const hasThemeBackground = isNowPlayingRoute && Boolean(nowPlayingTheme.background);

  return (
    <div className="app-container">
      {/* 실시간 앨범 커버 블러 배경 */}
      {isSolidBgRoute && <div className="app-solid-bg" />}
      {currentTrack && bgUrl && !hasThemeBackground && !isSolidBgRoute && (
        <div 
          key={currentTrack.id}
          className="app-blurred-bg fade-in-bg"
          style={{ backgroundImage: `url(${bgUrl})` }}
        />
      )}

      {/* Now Playing 플레이리스트 테마 (배경 이미지 / 눈·비 효과) */}
      <NowPlayingBackdrop theme={nowPlayingTheme} active={isNowPlayingRoute} />

      {/* 모바일 환경 감지 시 데스크톱/태블릿 권장 안내 화면 */}
      <MobileNoticeScreen />

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
    if (location.pathname === '/me') {
      return <MyInfoPage />;
    }
    if (location.pathname === '/settings') {
      return <SettingsPage />;
    }
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
      {/* 사이드바: Now Playing 앞쪽 효과(눈·비·벚꽃)가 이 위로는 그려지지 않음 */}
      <div className="left-panel-column" data-particle-occluder="">
        <PlaylistManager />
      </div>
      <div className="right-panel-column">
        <RightHeader />
        <div 
          ref={contentRef}
          className={`right-main-content scrollbar-none ${!isNowPlayingPage ? 'is-full-view' : ''} ${isNowPlayingPage ? 'is-now-playing-view' : ''}`}
        >
          {renderRightPanelContent()}

        </div>

        {/* 알림 토스트 (right-panel-column 기준 고정 플로팅) */}
        <div className={`toast ${hasBottomPlayer ? 'has-player' : 'no-player'} ${isToastVisible ? 'show' : ''}`}>
          {toastMessage}
        </div>

        {/* UI 숨기기 중: 왼쪽 위(숨겨진 헤더 자리)에 sofar 로고 */}
        {isNowPlayingPage && (
          <div className="np-brand-mark" aria-hidden="true">
            <Logo iconSize={20} titleSize="1.3rem" onClick={(e) => e.preventDefault()} />
          </div>
        )}

        {/* 유튜브 바로가기 버튼 (right-panel-column 기준 왼쪽 아래 고정 플로팅) */}
        {isNowPlayingPage && !isLyricsExpanded && currentTrack?.youtube_video_id && (
          <Button
            variant="icon"
            size="lg"
            leadingIcon={<YoutubeIcon size={24} />}
            onClick={() => window.open(`https://www.youtube.com/watch?v=${currentTrack.youtube_video_id}`, '_blank', 'noopener,noreferrer')}
            className="main-youtube-btn"
            title="YouTube에서 열기"
            aria-label="YouTube에서 열기"
          />
        )}

        {/* 오른쪽 아래 플로팅 영역: 노래 일치 피드백 캡슐 + UI 숨기기 토글 (right-panel-column 기준) */}
        {isNowPlayingPage && !isLyricsExpanded && currentTrack && (
          <div className="main-bottom-right-actions">
            {/* 노래 일치 여부 매칭 피드백 캡슐 */}
            {(!hasVotedCurrentTrack || isMatchFeedbackLoading) && (
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

            {/* UI 숨기기 토글 (헤더·가사 툴바·플로팅 버튼 숨김) */}
            <HideUiToggle />
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
            <Route path="/me" element={<AppShell><HomePage /></AppShell>} />
            <Route path="/settings" element={<AppShell><HomePage /></AppShell>} />

            {/* 플레이리스트 공유 링크 (진입 후 홈으로 교체) */}
            <Route path="/p/:playlistId" element={<AppShell><HomePage /><SharedPlaylistLinkOpener /></AppShell>} />

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
