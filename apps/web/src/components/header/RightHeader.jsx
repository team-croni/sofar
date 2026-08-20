import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ChevronDown, LogOut, LogIn, Disc, Home, Search, Headset, Headphones, FileText, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavHistory } from '../../hooks/useNavHistory';
import Avatar from '../ui/Avatar';
import Dropdown from '../ui/Dropdown';
import './RightHeader.css';

export default function RightHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { canGoBack, canGoForward } = useNavHistory();

  const [scrollOpacity, setScrollOpacity] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const headerRef = useRef(null);

  const isSearchPage = location.pathname === '/search';
  const isNowPlayingPage = location.pathname === '/now' || location.pathname === '/now-playing';

  // 라우트(화면) 전환 시 400ms 동안만 부드러운 Fade-In/Out transition 적용
  useEffect(() => {
    setIsTransitioning(true);
    setScrollOpacity(0);
    const timer = setTimeout(() => {
      setIsTransitioning(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [location.pathname]);

  useEffect(() => {
    let ticking = false;

    const handleScroll = (e) => {
      const target = e.target;
      if (!target) return;
      if (headerRef.current && headerRef.current.contains(target)) return;

      // 우측 패널 내부 요소 또는 window/document 스크롤일 경우에만 처리 (좌측 사이드바 무시)
      const rightPanel = headerRef.current?.closest('.right-panel-column');
      if (rightPanel && !rightPanel.contains(target) && target !== document && target !== window) {
        return;
      }

      const scrollTop = target === document || target === window
        ? (window.scrollY || document.documentElement?.scrollTop || 0)
        : (target.scrollTop || 0);

      const opacity = Math.min(1, Math.max(0, scrollTop / 50));

      if (!ticking) {
        window.requestAnimationFrame(() => {
          setScrollOpacity(opacity);
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll, { capture: true });
    };
  }, []);

  const userName = user?.user_metadata?.full_name
    || user?.user_metadata?.name
    || user?.email?.split('@')[0]
    || 'Guest';

  // 소셜 계정의 기본 프로필 이미지 대신 서비스 전용 매쉬 그라디언트 기본 아바타를 우선 사용하며,
  // 사용자가 프로필 설정에서 직접 업로드한 커스텀 프로필 이미지(custom_avatar_url)가 있을 때만 이미지 노출
  const userAvatar = user?.user_metadata?.custom_avatar_url
    || user?.user_metadata?.uploaded_avatar_url
    || user?.custom_avatar_url
    || null;
  const isGuest = !user || user.isGuest;

  // 현재 경로 라벨 정보
  const getCurrentPageLabel = () => {
    if (isSearchPage) return { title: '검색', icon: <Search size={16} /> };
    if (isNowPlayingPage) return { title: 'Now Playing', icon: <Headphones size={16} /> };
    return { title: 'Home', icon: <Home size={16} /> };
  };

  const currentRoute = getCurrentPageLabel();

  // Now Playing 화면은 스크롤이 없으므로 상시 배경 노출(1),
  // 홈·검색 화면은 스크롤에 따른 가변 노출
  const headerOpacity = isNowPlayingPage ? 1 : scrollOpacity;

  return (
    <header 
      className={`right-panel-header ${isTransitioning ? 'is-transitioning' : ''}`}
      ref={headerRef}
      style={{ '--header-scroll-opacity': headerOpacity }}
    >
      {/* 왼쪽: 히스토리 내비게이션 컨트롤 및 위치 표시 */}
      <div className="right-header-left">
        <div className="header-nav-controls">
          <button
            className="header-nav-btn"
            onClick={() => canGoBack && navigate(-1)}
            disabled={!canGoBack}
            title={canGoBack ? "뒤로 가기" : undefined}
            aria-label="뒤로 가기"
          >
            <ChevronLeft size={22} />
          </button>
          <button
            className="header-nav-btn"
            onClick={() => canGoForward && navigate(1)}
            disabled={!canGoForward}
            title={canGoForward ? "앞으로 가기" : undefined}
            aria-label="앞으로 가기"
          >
            <ChevronRight size={22} />
          </button>
        </div>

        <div className="header-location-badge">
          <span className="location-icon">{currentRoute.icon}</span>
          <span className="location-title">{currentRoute.title}</span>
        </div>
      </div>

      {/* 오른쪽: 사용자 프로필 & 계정 드롭다운 */}
      <div className="right-header-right">
        <Dropdown
          align="right"
          trigger={(isOpen) => (
            <button 
              className={`user-profile-trigger ${isOpen ? 'active' : ''}`}
              title={isGuest ? "로그인 및 메뉴" : `${userName} 프로필`}
              aria-label={isGuest ? "로그인 및 메뉴" : `${userName} 프로필`}
            >
              <Avatar src={userAvatar} name={userName} size={30} />
              <span className="user-profile-name">{userName}</span>
            </button>
          )}
        >
          {(close) => (
            <div className="profile-dropdown-content">
              {/* 프로필 정보 헤더 */}
              <div className="profile-dropdown-header">
                <Avatar src={userAvatar} name={userName} size={42} />
                <div className="profile-dropdown-meta">
                  <span className="profile-meta-name" title={userName}>{userName}</span>
                  <span className="profile-meta-email" title={isGuest ? '로그인하고 보관함을 사용해보세요' : user?.email}>
                    {isGuest ? '게스트 모드로 이용 중' : (user?.email || 'guest@sofar.app')}
                  </span>
                </div>
              </div>

              {isGuest && (
                <>
                  <div className="profile-dropdown-divider" />
                  <div className="profile-dropdown-actions">
                    <button
                      className="profile-dropdown-item login-btn"
                      onClick={() => {
                        close();
                        navigate('/login');
                      }}
                    >
                      <LogIn size={15} />
                      <span>로그인</span>
                    </button>
                  </div>
                </>
              )}

              <div className="profile-dropdown-divider" />

              {/* 서비스 정책 & 약관 링크 */}
              <div className="profile-dropdown-actions">
                <a
                  href="/terms"
                  target="_blank"
                  rel="noreferrer"
                  className="profile-dropdown-item"
                  onClick={() => close()}
                >
                  <FileText size={15} />
                  <span>이용약관</span>
                </a>
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noreferrer"
                  className="profile-dropdown-item"
                  onClick={() => close()}
                >
                  <ShieldCheck size={15} />
                  <span>개인정보처리방침</span>
                </a>
              </div>

              {!isGuest && (
                <>
                  <div className="profile-dropdown-divider" />
                  <div className="profile-dropdown-actions">
                    <button
                      className="profile-dropdown-item logout-btn"
                      onClick={() => {
                        close();
                        logout();
                      }}
                    >
                      <LogOut size={15} />
                      <span>로그아웃</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </Dropdown>
      </div>
    </header>
  );
}
