import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronRight, Search } from 'lucide-react';
import { Button } from '@sofar/ui';
import { useAdmin } from '../context/AdminContext';
import '../pages/CurationsPage.css';

export default function AdminHeader({ breadcrumbs, pageTitle = '큐레이션 관리', children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isRightSidebarOpen, toggleRightSidebar } = useAdmin();

  const isDashboardPage = location.pathname === '/';
  const isCurationsPage = location.pathname === '/curations';
  const isEditorPage = location.pathname.startsWith('/playlist/');

  // Breadcrumb items resolution
  let items = [];
  if (breadcrumbs && Array.isArray(breadcrumbs) && breadcrumbs.length > 0) {
    items = breadcrumbs;
  } else if (isDashboardPage) {
    items = [{ label: '대시보드' }];
  } else if (isCurationsPage) {
    items = [
      { label: '대시보드', path: '/' },
      { label: '큐레이션 관리', path: '/curations?category=all' },
      { label: pageTitle || '전체 큐레이션' },
    ];
  } else if (isEditorPage) {
    items = [
      { label: '대시보드', path: '/' },
      { label: '큐레이션 관리', path: '/curations?category=all' },
      { label: pageTitle || '큐레이션 생성' },
    ];
  } else {
    items = [
      { label: '대시보드', path: '/' },
      { label: pageTitle },
    ];
  }

  return (
    <header className="admin-header">
      <div className="admin-header-title">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <React.Fragment key={index}>
              {item.path && !isLast ? (
                <span
                  className="admin-header-breadcrumb"
                  onClick={() => navigate(item.path)}
                >
                  {item.label}
                </span>
              ) : (
                <span className={isLast ? 'admin-header-page-title' : 'admin-header-breadcrumb'}>
                  {item.label}
                </span>
              )}
              {!isLast && <ChevronRight size={14} className="admin-header-chevron" />}
            </React.Fragment>
          );
        })}
      </div>
      <div className="admin-header-right">
        {children && (
          <div className="admin-header-actions">
            {children}
          </div>
        )}
        <Button
          variant="secondary"
          size="lg"
          className={`admin-header-toggle-btn ${isRightSidebarOpen ? 'active' : ''}`}
          onClick={toggleRightSidebar}
          title={isRightSidebarOpen ? '검색 패널 닫기' : '검색 패널 열기'}
          leadingIcon={<Search size={18} />}
        />
      </div>
    </header>
  );
}


