import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ListMusic,
  Sparkles,
  Compass,
  Headphones,
  Users,
  TrendingUp,
  PlusCircle,
  ExternalLink,
  ShieldCheck,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { Logo, Button } from '@sofar/ui';
import { useAdmin } from '../context/AdminContext';
import './AdminSidebar.css';

const WEB_URL = import.meta.env.VITE_WEB_URL || 'http://localhost:5173';

export default function AdminSidebar({
  activeTab = 'all',
  onTabChange,
  counts: countsProp,
  onLogout,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const admin = useAdmin();

  const isCollapsed = admin.isSidebarCollapsed;
  const setIsCollapsed = admin.setIsSidebarCollapsed;
  const isCurationSubmenuOpen = admin.isCurationSubmenuOpen;
  const setIsCurationSubmenuOpen = admin.setIsCurationSubmenuOpen;

  const displayCounts = countsProp || admin.counts;
  const handleLogoutAction = onLogout || admin.logout;

  const isDashboardPage = location.pathname === '/';
  const isCurationsPage = location.pathname === '/curations';
  const isSearchRankingPage = location.pathname === '/search-ranking';
  const isUsersPage = location.pathname === '/users';
  const isEditorPage = location.pathname.startsWith('/playlist/');

  const handleDashboardClick = () => {
    navigate('/');
  };

  const handleSearchRankingClick = () => {
    navigate('/search-ranking');
  };

  const handleUsersClick = () => {
    navigate('/users');
  };


  const handleNavClick = (tabId) => {
    if (isCurationsPage && onTabChange) {
      onTabChange(tabId);
    } else {
      navigate(`/curations?category=${tabId}`);
    }
  };

  const handleCurationMenuClick = () => {
    if (isCollapsed) {
      handleNavClick('all');
    } else {
      if (!isCurationsPage) {
        navigate('/curations');
        setIsCurationSubmenuOpen(true);
      } else {
        // 큐레이션 페이지에서 이미 메뉴가 열려있는데 또 클릭한 경우 토글
        setIsCurationSubmenuOpen((prev) => !prev);
      }
    }
  };

  const handleNewPlaylistClick = () => {
    navigate('/playlist/new');
  };

  const navSubItems = [
    {
      id: 'all',
      label: '전체 큐레이션',
      count: displayCounts.all,
    },
    {
      id: 'theme',
      label: '테마별 큐레이션',
      count: displayCounts.theme,
    },
    {
      id: 'situation',
      label: '상황별 큐레이션',
      count: displayCounts.situation,
    },
    {
      id: 'genre',
      label: '장르별 큐레이션',
      count: displayCounts.genre,
    },
    {
      id: 'user_shared',
      label: '공유 플레이리스트',
      count: displayCounts.user_shared,
      highlight: true,
    },
  ];

  return (
    <aside className={`admin-snb ${isCollapsed ? 'collapsed' : ''}`}>
      {/* ── Brand Header ── */}
      <div className="admin-snb-header">
        {isCollapsed ? (
          <div className="admin-snb-header-collapsed">
            <div className="admin-snb-brand-icon" onClick={() => navigate('/')} title="sofar 대시보드">
              <Logo iconSize={24} />
            </div>
            <Button
              size="lg"
              onClick={() => setIsCollapsed(false)}
              title="사이드바 펼치기"
              leadingIcon={<ChevronRight size={20} />}
            />
          </div>
        ) : (
          <>
            <div className="admin-snb-brand" onClick={() => navigate('/')}>
              <Logo iconSize={24} titleSize="1.75rem" />
            </div>
            <Button
              size="lg"
              onClick={() => setIsCollapsed(true)}
              title="사이드바 접기"
              leadingIcon={<ChevronLeft size={20} />}
            />
          </>
        )}
      </div>

      {/* ── Navigation List ── */}
      <nav className="admin-snb-nav">
        {/* 메뉴 그룹 */}
        <div className="admin-snb-group">
          {/* 대시보드 */}
          <button
            className={`admin-snb-item ${isDashboardPage ? 'active' : ''}`}
            onClick={handleDashboardClick}
            title={isCollapsed ? '대시보드' : undefined}
          >
            <div className="admin-snb-item-left">
              <span className="admin-snb-item-icon">
                <LayoutDashboard size={18} />
              </span>
              <span className="admin-snb-item-label">대시보드</span>
            </div>
          </button>

          {/* 큐레이션 관리 */}
          <div
            className={`admin-snb-item ${isCurationsPage ? 'active' : ''}`}
            onClick={handleCurationMenuClick}
            role="button"
            tabIndex={0}
            title={isCollapsed ? '큐레이션 관리' : undefined}
          >
            <div className="admin-snb-item-left">
              <span className="admin-snb-item-icon">
                <ListMusic size={18} />
              </span>
              <span className="admin-snb-item-label">큐레이션 관리</span>
            </div>
            {!isCollapsed && (
              <div className="admin-snb-item-right">
                <button
                  type="button"
                  className="admin-snb-chevron-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setIsCurationSubmenuOpen((prev) => !prev);
                  }}
                  title={isCurationSubmenuOpen ? '메뉴 접기' : '메뉴 펼치기'}
                  aria-label={isCurationSubmenuOpen ? '메뉴 접기' : '메뉴 펼치기'}
                >
                  {isCurationSubmenuOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
              </div>
            )}
          </div>

          {!isCollapsed && isCurationSubmenuOpen && (
            <div className="admin-snb-submenu">
              {navSubItems.map((sub) => {
                const isActive = isCurationsPage && activeTab === sub.id;
                return (
                  <button
                    key={sub.id}
                    className={`admin-snb-subitem ${isActive ? 'active' : ''} ${
                      sub.highlight ? 'highlight' : ''
                    }`}
                    onClick={() => handleNavClick(sub.id)}
                  >
                    <span className="admin-snb-subitem-label">{sub.label}</span>
                    {sub.count !== undefined && (
                      <span className="admin-snb-subitem-count">{sub.count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* 검색어 순위 관리 */}
          <button
            className={`admin-snb-item ${isSearchRankingPage ? 'active' : ''}`}
            onClick={handleSearchRankingClick}
            title={isCollapsed ? '검색어 순위 관리' : undefined}
          >
            <div className="admin-snb-item-left">
              <span className="admin-snb-item-icon">
                <TrendingUp size={18} />
              </span>
              <span className="admin-snb-item-label">검색어 순위 관리</span>
            </div>
          </button>

          {/* 사용자 관리 */}
          <button
            className={`admin-snb-item ${isUsersPage ? 'active' : ''}`}
            onClick={handleUsersClick}
            title={isCollapsed ? '사용자 관리' : undefined}
          >
            <div className="admin-snb-item-left">
              <span className="admin-snb-item-icon">
                <Users size={18} />
              </span>
              <span className="admin-snb-item-label">사용자 관리</span>
            </div>
            {!isCollapsed && displayCounts.users !== undefined && displayCounts.users > 0 && (
              <div className="admin-snb-item-right">
                <span className="admin-snb-badge">{displayCounts.users}</span>
              </div>
            )}
          </button>
        </div>


        {/* 외부 서비스 그룹 (하단 끝 배치) */}
        <div className="admin-snb-group admin-snb-group-bottom">
          <button
            className="admin-snb-item"
            onClick={() => window.open(WEB_URL, '_blank')}
            title={isCollapsed ? '메인 서비스 열기' : undefined}
          >
            <div className="admin-snb-item-left">
              <span className="admin-snb-item-icon">
                <ExternalLink size={18} />
              </span>
              <span className="admin-snb-item-label">메인 서비스 열기</span>
            </div>
          </button>
        </div>
      </nav>

      {/* ── Footer / Profile Section ── */}
      <div className="admin-snb-footer">
        <div className="admin-snb-user-card">
          <div className="admin-snb-user-info">
            <div className="admin-snb-avatar">
              <ShieldCheck size={18} />
            </div>
            <div className="admin-snb-user-details">
              <span className="admin-snb-user-name">관리자 계정</span>
              <span className="admin-snb-user-role">인증 완료</span>
            </div>
          </div>

          {handleLogoutAction && (
            <Button
              size="lg"
              onClick={handleLogoutAction}
              title="로그아웃"
              leadingIcon={<LogOut size={16} />}
            />
          )}
        </div>
      </div>
    </aside>
  );
}
