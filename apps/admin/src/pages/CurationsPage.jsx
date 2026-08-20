import { useState, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { Button, Input, Badge, Logo } from '../components/ui';
import { Plus, Trash2, Edit, ArrowUp, ArrowDown, Eye, EyeOff, Loader2, ListMusic } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import { useAdmin } from '../context/AdminContext';
import { useToast } from '../context/ToastContext';
import './CurationsPage.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const WEB_URL = import.meta.env.VITE_WEB_URL || 'http://localhost:5173';

export default function CurationsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryParam = searchParams.get('category');
  const { showErrorToast, showSuccessToast } = useToast();

  const {
    adminKey,
    isLoggedIn,
    playlists,
    setPlaylists,
    userPlaylists,
    setUserPlaylists,
    isLoading,
    isUserLoading,
    fetchPlaylists,
    fetchUserPlaylists,
    login,
    logout,
    isRightSidebarOpen,
  } = useAdmin();

  const [keyInput, setKeyInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [activeTab, setActiveTab] = useState(categoryParam || 'all');

  useEffect(() => {
    const targetCategory = categoryParam || 'all';
    if (targetCategory !== activeTab) {
      setActiveTab(targetCategory);
    }
  }, [categoryParam]);

  const handleTabChange = (newTab) => {
    setActiveTab(newTab);
    setSearchParams({ category: newTab });
  };

  useEffect(() => {
    const savedKey = sessionStorage.getItem('sofar_admin_key') || localStorage.getItem('sofar_admin_key') || adminKey;
    if (savedKey) {
      fetchPlaylists(savedKey);
      fetchUserPlaylists(savedKey);
    }
  }, [location.key, adminKey]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!keyInput.trim()) return;

    setIsVerifying(true);
    setAuthError('');

    try {
      const res = await login(keyInput);
      if (!res.success) {
        setAuthError(res.message);
        showErrorToast(res.message, '인증 실패');
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

  const handleLogout = () => {
    logout();
  };

  const handleToggleUserActive = async (playlist) => {
    const currentActive = playlist.is_active !== false && playlist.is_public !== false;
    const newStatus = !currentActive;
    try {
      const res = await fetch(`${API_BASE}/api/admin/user-playlists/${playlist.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey,
        },
        body: JSON.stringify({ is_public: newStatus, is_active: newStatus }),
      });

      if (res.ok) {
        setUserPlaylists((prev) =>
          prev.map((item) =>
            item.id === playlist.id ? { ...item, is_public: newStatus, is_active: newStatus } : item
          )
        );
        showSuccessToast(`공유 상태가 ${newStatus ? '공개' : '비공개'}로 변경되었습니다.`);
      } else {
        showErrorToast('상태 변경 실패');
      }
    } catch (err) {
      console.error('Failed to update user playlist active status:', err);
      showErrorToast('상태 변경 중 오류가 발생했습니다.');
    }
  };

  const handleDeleteUserPlaylist = async (id, title) => {
    if (!window.confirm(`'${title}' 공유 플레이리스트를 삭제하시겠습니까?`)) return;

    try {
      const res = await fetch(`${API_BASE}/api/admin/user-playlists/${id}`, {
        method: 'DELETE',
        headers: { 'x-admin-key': adminKey },
      });

      if (res.ok) {
        setUserPlaylists((prev) => prev.filter((item) => item.id !== id));
        showSuccessToast(`'${title}' 공유 플레이리스트가 삭제되었습니다.`);
      } else {
        showErrorToast('삭제 실패');
      }
    } catch (err) {
      console.error('Failed to delete user playlist:', err);
      showErrorToast('삭제 중 오류가 발생했습니다.');
    }
  };

  const handleToggleActive = async (playlist) => {
    const newStatus = !playlist.is_active;
    try {
      const res = await fetch(`${API_BASE}/api/admin/playlists/${playlist.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey,
        },
        body: JSON.stringify({ is_active: newStatus }),
      });

      if (res.ok) {
        setPlaylists((prev) =>
          prev.map((item) =>
            item.id === playlist.id ? { ...item, is_active: newStatus } : item
          )
        );
        showSuccessToast(`공개 상태가 ${newStatus ? '공개' : '비공개'}로 변경되었습니다.`);
      } else {
        showErrorToast('상태 변경 실패');
      }
    } catch (err) {
      console.error('Failed to update playlist status:', err);
      showErrorToast('상태 변경 중 오류가 발생했습니다.');
    }
  };

  const handleDelete = async (id, title) => {
    if (!window.confirm(`'${title}' 플레이리스트를 삭제하시겠습니까?`)) return;

    try {
      const res = await fetch(`${API_BASE}/api/admin/playlists/${id}`, {
        method: 'DELETE',
        headers: { 'x-admin-key': adminKey },
      });

      if (res.ok) {
        setPlaylists((prev) => prev.filter((item) => item.id !== id));
        showSuccessToast(`'${title}' 큐레이션이 삭제되었습니다.`);
      } else {
        showErrorToast('삭제 실패');
      }
    } catch (err) {
      console.error('Failed to delete playlist:', err);
      showErrorToast('삭제 중 오류가 발생했습니다.');
    }
  };

  const handleMove = async (index, direction) => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= playlists.length) return;

    const updated = [...playlists];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;

    setPlaylists(updated);

    try {
      const orderedIds = updated.map((item) => item.id);
      await fetch(`${API_BASE}/api/admin/playlists-reorder`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey,
        },
        body: JSON.stringify({ orderedIds }),
      });
    } catch (err) {
      console.error('Failed to reorder playlists:', err);
      fetchPlaylists();
    }
  };

  const filteredPlaylists = playlists.filter((item) => {
    if (activeTab === 'all') return true;
    return item.category === activeTab;
  });

  const getTabLabel = (tab) => {
    switch (tab) {
      case 'theme': return '테마별 큐레이션';
      case 'situation': return '상황별 큐레이션';
      case 'genre': return '장르별 큐레이션';
      case 'user_shared': return '공유 플레이리스트';
      default: return '전체 큐레이션';
    }
  };

  return (
    <AdminLayout
      pageTitle={getTabLabel(activeTab)}
      activeTab={activeTab}
      onTabChange={handleTabChange}
    >
      <div className="curation-toolbar">
            <div className="admin-category-tabs">
              <button
                className={`admin-tab-btn ${activeTab === 'all' ? 'active' : ''}`}
                onClick={() => handleTabChange('all')}
              >
                <span>전체</span>
                <span className="admin-tab-badge">
                  {playlists.length}
                </span>
              </button>
              <button
                className={`admin-tab-btn ${activeTab === 'theme' ? 'active' : ''}`}
                onClick={() => handleTabChange('theme')}
              >
                <span>테마</span>
                <span className="admin-tab-badge">
                  {playlists.filter((p) => p.category === 'theme').length}
                </span>
              </button>
              <button
                className={`admin-tab-btn ${activeTab === 'situation' ? 'active' : ''}`}
                onClick={() => handleTabChange('situation')}
              >
                <span>상황</span>
                <span className="admin-tab-badge">
                  {playlists.filter((p) => p.category === 'situation').length}
                </span>
              </button>
              <button
                className={`admin-tab-btn ${activeTab === 'genre' ? 'active' : ''}`}
                onClick={() => handleTabChange('genre')}
              >
                <span>장르</span>
                <span className="admin-tab-badge">
                  {playlists.filter((p) => p.category === 'genre').length}
                </span>
              </button>
              <button
                className={`admin-tab-btn share ${activeTab === 'user_shared' ? 'active tab-highlight' : ''}`}
                onClick={() => handleTabChange('user_shared')}
              >
                <span>유저 공유</span>
                <span className="admin-tab-badge">
                  {userPlaylists.length}
                </span>
              </button>
            </div>

            <div className="curation-toolbar-actions">
              <Button
                size="sm"
                variant="primary"
                onClick={() => navigate('/playlist/new')}
                leadingIcon={<Plus size={14} />}
              >
                새 큐레이션 생성
              </Button>
            </div>
          </div>

          {activeTab === 'user_shared' ? (
            isUserLoading ? (
              <div className="empty-state">
                <Loader2 size={24} className="animate-spin-slow" />
                <p className="empty-state-text">공유 플레이리스트 불러오는 중...</p>
              </div>
            ) : userPlaylists.length === 0 ? (
              <div className="empty-state">
                <ListMusic size={32} className="empty-state-icon" />
                <p className="empty-state-text">등록된 공유 플레이리스트가 없습니다.</p>
              </div>
            ) : (
              <div className="admin-table-card">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>플레이리스트</th>
                      <th className="col-author">소유자</th>
                      <th className="col-track-count">곡 수</th>
                      <th className="col-status">유저 공유</th>
                      <th className="col-status">홈 노출</th>
                      <th className="col-actions">관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userPlaylists.map((item) => {
                      const tracksCount = Array.isArray(item.tracks) ? item.tracks.length : 0;
                      const isExposed = item.is_active !== false && item.is_public !== false;
                      return (
                        <tr key={item.id}>
                          <td>
                            <div className="playlist-cover-cell">
                              {item.cover || item.cover_url ? (
                                <img
                                  src={item.cover || item.cover_url}
                                  alt={item.title}
                                  className="playlist-cover-img"
                                  onError={(e) => { e.target.style.display = 'none'; }}
                                />
                              ) : (
                                <div className="playlist-cover-img">
                                  <ListMusic size={16} />
                                </div>
                              )}
                              <div className="playlist-title-info">
                                <span className="playlist-title-text">{item.title}</span>
                                <span className="playlist-subtitle-text">
                                  {item.description || '유저 플레이리스트'}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="text-center">
                            <div className="author-info-cell">
                              <span className="author-nickname">
                                {item.owner_nickname || item.user_nickname || item.author || '익명'}
                              </span>
                            </div>
                          </td>
                          <td className="col-track-count text-center">
                            {tracksCount}곡
                          </td>
                          <td className="text-center">
                            <div className="status-badge active static" title="유저가 설정한 공유 상태">
                              <Eye size={12} />
                              <span>공개 중</span>
                            </div>
                          </td>
                          <td className="text-center">
                            <button
                              type="button"
                              className={`status-badge clickable ${isExposed ? 'active' : 'inactive'}`}
                              onClick={() => handleToggleUserActive(item)}
                              title="클릭하여 메인 앱 홈 패널 노출/숨김 변경"
                            >
                              {isExposed ? <Eye size={12} /> : <EyeOff size={12} />}
                              <span>{isExposed ? '노출 중' : '숨김'}</span>
                            </button>
                          </td>
                          <td className="text-right">
                            <div className="action-row">
                              <Button
                                variant="secondary"
                                size="md"
                                leadingIcon={<Edit size={16} />}
                                onClick={() => navigate(`/playlist/${item.id}?type=user`)}
                              >
                              </Button>
                              <Button
                                variant="danger"
                                size="md"
                                leadingIcon={<Trash2 size={16} />}
                                onClick={() => handleDeleteUserPlaylist(item.id, item.title)}
                              >
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : isLoading ? (
            <div className="empty-state">
              <Loader2 size={24} className="animate-spin-slow" />
              <p className="empty-state-text">플레이리스트 불러오는 중...</p>
            </div>
          ) : filteredPlaylists.length === 0 ? (
            <div className="empty-state">
              <ListMusic size={40} className="empty-state-icon" />
              <p className="empty-state-text">등록된 플레이리스트가 없습니다.</p>
            </div>
          ) : (
            <div className="admin-table-card">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th className="col-order">순서</th>
                    <th>플레이리스트</th>
                    <th className="col-category">카테고리</th>
                    <th className="col-track-count">곡 수</th>
                    <th className="col-status">노출 여부</th>
                    <th className="col-actions">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPlaylists.map((item, index) => {
                    const tracksCount = Array.isArray(item.tracks) ? item.tracks.length : 0;
                    return (
                      <tr key={item.id}>
                        <td className="text-center">
                          <div className="order-btn-group justify-center">
                            <Button
                              variant="secondary"
                              size="sm"
                              className="order-btn"
                              disabled={index === 0}
                              onClick={() => handleMove(index, 'up')}
                              title="위로 이동"
                              leadingIcon={<ArrowUp size={13} />}
                            />
                            <Button
                              variant="secondary"
                              size="sm"
                              className="order-btn"
                              disabled={index === filteredPlaylists.length - 1}
                              onClick={() => handleMove(index, 'down')}
                              title="아래로 이동"
                              leadingIcon={<ArrowDown size={13} />}
                            />
                          </div>
                        </td>
                        <td>
                          <div className="playlist-cover-cell">
                            {item.cover || item.cover_url ? (
                              <img
                                src={item.cover || item.cover_url}
                                alt={item.title}
                                className="playlist-cover-img"
                                onError={(e) => { e.target.style.display = 'none'; }}
                              />
                            ) : (
                              <div className="playlist-cover-img">
                                <ListMusic size={16} />
                              </div>
                            )}
                            <div className="playlist-title-info">
                              <span className="playlist-title-text">{item.title}</span>
                              <span className="playlist-subtitle-text">
                                {item.subtitle || item.category_label || 'sofar'}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="text-center">
                          <Badge variant="secondary">
                            {item.category === 'theme' ? '테마' : item.category === 'situation' ? '상황' : '장르'}
                          </Badge>
                        </td>
                        <td className="col-track-count text-center">
                          {tracksCount}곡
                        </td>
                        <td className="text-center">
                          <button
                            type="button"
                            className={`status-badge clickable ${item.is_active ? 'active' : 'inactive'}`}
                            onClick={() => handleToggleActive(item)}
                            title="클릭하여 메인 앱 홈 패널 노출/숨김 변경"
                          >
                            {item.is_active ? <Eye size={12} /> : <EyeOff size={12} />}
                            <span>{item.is_active ? '노출 중' : '숨김'}</span>
                          </button>
                        </td>
                        <td className="text-right">
                          <div className="action-row">
                            <Button
                              variant="secondary"
                              size="md"
                              leadingIcon={<Edit size={16} />}
                              onClick={() => navigate(`/playlist/${item.id}`)}
                            >
                            </Button>
                            <Button
                              variant="danger"
                              size="md"
                              leadingIcon={<Trash2 size={16} />}
                              onClick={() => handleDelete(item.id, item.title)}
                            >
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
    </AdminLayout>
  );
}
