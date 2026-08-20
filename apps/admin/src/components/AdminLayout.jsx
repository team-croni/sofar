import React, { useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { Button, Input, Logo } from './ui';
import AdminHeader from './AdminHeader';
import AdminSidebar from './AdminSidebar';
import AdminRightSidebar from './AdminRightSidebar';
import { useAdmin } from '../context/AdminContext';
import { useToast } from '../context/ToastContext';
import './AdminSidebar.css';
import '../pages/CurationsPage.css';

export default function AdminLayout({
  children,
  pageTitle,
  breadcrumbs,
  headerActions,
  activeTab: activeTabProp,
  onTabChange,
}) {
  const { isLoggedIn, login, isRightSidebarOpen } = useAdmin();
  const { showErrorToast, showSuccessToast } = useToast();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [keyInput, setKeyInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  // 탭 자동 계산
  const categoryParam = searchParams.get('category');
  const currentTab = activeTabProp || (location.pathname === '/' ? 'dashboard' : (categoryParam || 'all'));

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!keyInput.trim()) return;

    setIsVerifying(true);
    setAuthError('');

    try {
      const res = await login(keyInput);
      if (!res.success) {
        setAuthError(res.message || '인증에 실패했습니다.');
        showErrorToast(res.message || '인증 실패', '로그인 오류');
      } else {
        showSuccessToast('관리자로 성공적으로 로그인했습니다.', '로그인 성공');
      }
    } catch (err) {
      setAuthError('서버 연결 실패: API 서버가 실행 중인지 확인하세요.');
      showErrorToast('서버 연결에 실패했습니다.');
    } finally {
      setIsVerifying(false);
    }
  };

  // ── 미인증 가드 화면 ──
  if (!isLoggedIn) {
    return (
      <div className="admin-container">
        <div className="admin-login-wrapper">
          <div className="admin-login-card">
            <div className="admin-login-header">
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.75rem' }}>
                <Logo iconSize={36} titleSize="1.75rem" showSubtitle onClick={() => {}} />
              </div>
              <p className="admin-login-subtitle">
                큐레이션 플레이리스트 및 데이터 관리를 위한 Admin API Key를 입력하세요.
              </p>
            </div>
            <form onSubmit={handleLogin} className="admin-login-form">
              <Input
                type="password"
                label="Admin API Key"
                placeholder="환경변수에 설정된 ADMIN_API_KEY"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                error={authError}
                autoFocus
              />
              <Button
                type="submit"
                variant="primary"
                loading={isVerifying}
                style={{ width: '100%', marginTop: '0.5rem' }}
              >
                인증하고 입장하기
              </Button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`admin-layout-container ${isRightSidebarOpen ? 'has-right-sidebar' : ''}`}>
      <AdminSidebar
        activeTab={currentTab}
        onTabChange={onTabChange}
      />
      <div className="admin-content-area scrollbar-none">
        <AdminHeader pageTitle={pageTitle} breadcrumbs={breadcrumbs}>
          {headerActions}
        </AdminHeader>

        <main className="admin-main">
          {children}
        </main>
      </div>
      <AdminRightSidebar />
    </div>
  );
}
