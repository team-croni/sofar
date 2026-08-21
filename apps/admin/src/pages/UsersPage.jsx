import { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Search,
  UserCheck,
  UserX,
  Eye,
  Trash2,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import { Button, Input, Select, Modal, KpiCard } from '../components/ui';
import { useAdmin } from '../context/AdminContext';
import { useToast } from '../context/ToastContext';
import './DashboardPage.css';
import './UsersPage.css';

// ── 사용자 계정 상태 표준 통합 헬퍼 (Single Source of Truth) ──
const getUserStatusConfig = (isBanned) => {
  if (isBanned) {
    return {
      status: 'banned',
      label: '정지됨',
      modalLabel: '정지 상태',
      badgeClass: 'banned',
      color: 'var(--error, #e57373)',
      actionTitle: '계정 정지 해제',
      toggleBtnLabel: '계정 정지 해제',
    };
  }
  return {
    status: 'active',
    label: '정상 활성',
    modalLabel: '정상 활성',
    badgeClass: 'active',
    color: 'var(--success, #81c784)',
    actionTitle: '계정 이용 정지',
    toggleBtnLabel: '계정 이용 정지',
  };
};

export default function UsersPage() {
  const {
    adminKey,
    users,
    userStats,
    isUsersLoading,
    fetchUsers,
    fetchUserStats,
    updateUserStatus,
    deleteUser,
  } = useAdmin();

  const { showSuccessToast, showErrorToast } = useToast();

  // 탭 및 필터 상태
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'active' | 'banned'
  const [searchQuery, setSearchQuery] = useState('');
  const [providerFilter, setProviderFilter] = useState('all'); // 'all' | 'google' | 'email'
  const [sortBy, setSortBy] = useState('latest'); // 'latest' | 'oldest' | 'playlists' | 'name'

  // 모달 상태
  const [selectedUser, setSelectedUser] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [editingNickname, setEditingNickname] = useState('');
  const [isSavingNickname, setIsSavingNickname] = useState(false);

  useEffect(() => {
    if (adminKey) {
      fetchUsers(adminKey);
      fetchUserStats(adminKey);
    }
  }, [adminKey]);

  // 필터링 및 정렬된 유저 목록
  const filteredUsers = useMemo(() => {
    return users
      .filter((user) => {
        // 1. 탭 필터 (상태)
        if (activeTab === 'active' && user.is_banned) return false;
        if (activeTab === 'banned' && !user.is_banned) return false;

        // 2. 검색어 필터
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchName = user.nickname?.toLowerCase().includes(q);
          const matchEmail = user.email?.toLowerCase().includes(q);
          const matchId = user.id?.toLowerCase().includes(q);
          if (!matchName && !matchEmail && !matchId) return false;
        }

        // 3. 로그인 제공자 필터
        if (providerFilter !== 'all') {
          if (user.provider !== providerFilter) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'latest') {
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        }
        if (sortBy === 'oldest') {
          return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
        }
        if (sortBy === 'playlists') {
          return (b.playlist_count || 0) - (a.playlist_count || 0);
        }
        if (sortBy === 'name') {
          return (a.nickname || '').localeCompare(b.nickname || '');
        }
        return 0;
      });
  }, [users, activeTab, searchQuery, providerFilter, sortBy]);

  // 사용자 상세 모달 열기
  const handleOpenUserDetail = (user) => {
    setSelectedUser(user);
    setEditingNickname(user.nickname || '');
    setIsDetailModalOpen(true);
  };

  // 닉네임 수정 저장
  const handleSaveNickname = async () => {
    if (!selectedUser || !editingNickname.trim()) return;
    setIsSavingNickname(true);
    try {
      const ok = await updateUserStatus(selectedUser.id, { nickname: editingNickname.trim() });
      if (ok) {
        showSuccessToast('사용자 닉네임이 성공적으로 변경되었습니다.');
        setSelectedUser((prev) => ({ ...prev, nickname: editingNickname.trim() }));
      } else {
        showErrorToast('닉네임 수정에 실패했습니다.');
      }
    } catch (err) {
      showErrorToast('오류가 발생했습니다.');
    } finally {
      setIsSavingNickname(false);
    }
  };

  // 계정 상태 (활성 / 정지) 토글
  const handleToggleStatus = async (user) => {
    const nextBanned = !user.is_banned;
    const statusConfig = getUserStatusConfig(nextBanned);
    const actionText = statusConfig.actionTitle;
    const confirmMsg = `정말 '${user.nickname || user.email}' 사용자를 ${actionText} 처리하시겠습니까?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      const ok = await updateUserStatus(user.id, { is_banned: nextBanned, status: nextBanned ? 'banned' : 'active' });
      if (ok) {
        showSuccessToast(`사용자가 ${actionText} 처리되었습니다.`);
        if (selectedUser?.id === user.id) {
          setSelectedUser((prev) => ({
            ...prev,
            is_banned: nextBanned,
            status: nextBanned ? 'banned' : 'active',
          }));
        }
      } else {
        showErrorToast(`${actionText} 처리에 실패했습니다.`);
      }
    } catch (err) {
      showErrorToast('오류가 발생했습니다.');
    }
  };

  // 사용자 삭제
  const handleDeleteUser = async (user) => {
    const confirmMsg = `경고: '${user.nickname || user.email}' 사용자를 삭제하면 해당 유저의 모든 보관 플레이리스트 및 데이터가 영구 삭제됩니다.\n계속 진행하시겠습니까?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const ok = await deleteUser(user.id);
      if (ok) {
        showSuccessToast('사용자가 정상적으로 삭제되었습니다.');
        if (selectedUser?.id === user.id) {
          setIsDetailModalOpen(false);
          setSelectedUser(null);
        }
      } else {
        showErrorToast('사용자 삭제에 실패했습니다.');
      }
    } catch (err) {
      showErrorToast('오류가 발생했습니다.');
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    } catch (e) {
      return dateStr;
    }
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch (e) {
      return dateStr;
    }
  };

  const totalCount = users.length;
  const activeCount = users.filter((u) => !u.is_banned).length;
  const bannedCount = users.filter((u) => u.is_banned).length;

  return (
    <AdminLayout pageTitle="사용자 관리" activeTab="users">
      <div className="users-page-container">
        {/* ── Top 4 KPI Metric Cards Grid (Standardized Common KpiCard Component) ── */}
        <div className="users-summary-grid">
          {/* Card 1: Total Users */}
          <KpiCard
            label="전체 사용자"
            value={`${userStats.totalUsers || totalCount}명`}
            subText={`Google ${userStats.googleUsersCount || 0} · 이메일 ${userStats.emailUsersCount || 0}`}
            tagText="100% 정상"
            tagVariant="success"
          />

          {/* Card 2: Active Users */}
          <KpiCard
            label="정상 활성"
            value={`${userStats.activeUsers || activeCount}명`}
            subText={`활성 ${activeCount} · 정지 ${bannedCount}`}
            tagText={`${totalCount > 0 ? Math.round((activeCount / totalCount) * 100) : 100}% 활성`}
            tagVariant="success"
          />

          {/* Card 3: New Users (7 days) */}
          <KpiCard
            label="주간 신규 가입"
            value={`${userStats.newUsersThisWeek || 0}명`}
            subText="최근 7일 유입"
            tagText={`+${userStats.newUsersThisWeek || 0}명 증가`}
            tagVariant="info"
          />

          {/* Card 4: Created Playlists */}
          <KpiCard
            label="공유 플레이리스트"
            value={`${userStats.totalUserPlaylists || 0}개`}
            subText={`총 수록곡 ${userStats.totalUserTracks || 0}곡`}
            tagText="공유 활동"
            tagVariant="warning"
          />
        </div>

        {/* ── Main Users Management Card (Integrated Tabs, Filters & Table) ── */}
        <div className="users-main-card">
          {/* Card Header: Tabs (Left) & Search/Filters (Right) */}
          <div className="users-card-header">
            {/* Tab Buttons (insights-tab-group style) */}
            <div className="insights-tab-group">
              <button
                type="button"
                className={`insight-tab-btn ${activeTab === 'all' ? 'active' : ''}`}
                onClick={() => setActiveTab('all')}
              >
                <span>전체 사용자</span>
                <span className="insights-tab-badge">{totalCount}</span>
              </button>
              <button
                type="button"
                className={`insight-tab-btn ${activeTab === 'active' ? 'active' : ''}`}
                onClick={() => setActiveTab('active')}
              >
                <span>정상 활성</span>
                <span className="insights-tab-badge">{activeCount}</span>
              </button>
              <button
                type="button"
                className={`insight-tab-btn ${activeTab === 'banned' ? 'active' : ''}`}
                onClick={() => setActiveTab('banned')}
              >
                <span>정지/차단</span>
                <span className="insights-tab-badge">{bannedCount}</span>
              </button>
            </div>

            {/* Search, Filters & Refresh Controls Group */}
            <div className="users-toolbar-actions">
              {/* Search Input using @sofar/ui Input */}
              <div className="users-search-wrapper">
                <Input
                  placeholder="닉네임, 이메일, ID 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  leadingIcon={<Search size={14} />}
                />
              </div>

              <div className="users-select-container">
                <Select
                  value={providerFilter}
                  onChange={(e) => setProviderFilter(e.target.value)}
                  options={[
                    { value: 'all', label: '전체 인증 방식' },
                    { value: 'google', label: 'Google 계정' },
                    { value: 'email', label: '이메일 계정' },
                  ]}
                />
              </div>

              <div className="users-select-container">
                <Select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  options={[
                    { value: 'latest', label: '최신 가입순' },
                    { value: 'oldest', label: '오래된 가입순' },
                    { value: 'playlists', label: '플레이리스트순' },
                    { value: 'name', label: '이름 가나다순' },
                  ]}
                />
              </div>

              <Button
                size="md"
                variant="secondary"
                leadingIcon={<RefreshCw size={14} />}
                loading={isUsersLoading}
                onClick={() => {
                  fetchUsers(adminKey);
                  fetchUserStats(adminKey);
                }}
                title="새로고침"
              />
            </div>
          </div>

          {/* Card Body: Table Container with Overflow Guard */}
          <div className="users-table-card">
            {isUsersLoading && users.length === 0 ? (
              <div className="empty-state">
                <Loader2 size={24} className="animate-spin-slow" />
                <p className="empty-state-text">사용자 목록 불러오는 중...</p>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="empty-state">
                <Users size={32} />
                <p className="empty-state-text">일치하는 사용자가 없습니다.</p>
              </div>
            ) : (
              <table className="users-table">
                <thead>
                  <tr>
                    <th style={{ width: '25%' }}>사용자 프로필</th>
                    <th style={{ width: '22%' }}>이메일 / 로그인 수단</th>
                    <th style={{ width: '18%' }}>플레이리스트 활동</th>
                    <th style={{ width: '15%' }}>가입 일시</th>
                    <th style={{ width: '10%', textAlign: 'center' }}>계정 상태</th>
                    <th style={{ width: '10%', textAlign: 'right' }}>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => {
                    const initial = (user.nickname || user.email || 'U').charAt(0).toUpperCase();
                    const statusConfig = getUserStatusConfig(user.is_banned);
                    return (
                      <tr key={user.id}>
                        {/* Profile (Clickable to open detail modal) */}
                        <td>
                          <div
                            className="user-profile-flex user-profile-clickable"
                            onClick={() => handleOpenUserDetail(user)}
                            title="클릭하여 사용자 상세 정보 보기"
                          >
                            <div className="user-avatar-gradient">
                              {user.avatar_url ? (
                                <img
                                  src={user.avatar_url}
                                  alt=""
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                  }}
                                />
                              ) : (
                                <span>{initial}</span>
                              )}
                            </div>
                            <div className="user-profile-meta">
                              <span className="user-profile-name">{user.nickname || '익명 사용자'}</span>
                              <span className="user-profile-id">
                                {user.id ? `${user.id.substring(0, 8)}...` : '-'}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Email & Provider */}
                        <td>
                          <div className="user-email-group">
                            <span className="user-email-text">{user.email}</span>
                            <span className={`provider-tag ${user.provider}`}>
                              {user.provider === 'google' ? 'Google' : '이메일'}
                            </span>
                          </div>
                        </td>

                        {/* Playlists (Guaranteed no single-letter vertical break) */}
                        <td>
                          <div className="user-activity-group">
                            <span className="user-activity-main">
                              {user.playlist_count || 0}개 플레이리스트
                            </span>
                            <span className="user-activity-sub">
                              총 {user.track_count || 0}곡 수록
                            </span>
                          </div>
                        </td>

                        {/* Created At */}
                        <td>
                          <div className="user-date-group">
                            <span className="user-date-created">{formatDate(user.created_at)}</span>
                            <span className="user-date-recent">
                              최근: {formatDate(user.last_sign_in_at)}
                            </span>
                          </div>
                        </td>

                        {/* Status Pill */}
                        <td style={{ textAlign: 'center' }}>
                          <span className={`user-status-pill ${statusConfig.badgeClass}`}>
                            {statusConfig.label}
                          </span>
                        </td>

                        {/* Actions */}
                        <td style={{ textAlign: 'right' }}>
                          <div className="user-table-actions">
                            <Button
                              size="sm"
                              variant="secondary"
                              leadingIcon={<Eye size={14} />}
                              onClick={() => handleOpenUserDetail(user)}
                              title="상세 정보 보기"
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              leadingIcon={
                                user.is_banned ? (
                                  <UserCheck size={14} style={{ color: 'var(--success, #4ade80)' }} />
                                ) : (
                                  <UserX size={14} style={{ color: 'var(--error, #f87171)' }} />
                                )
                              }
                              onClick={() => handleToggleStatus(user)}
                              title={statusConfig.actionTitle}
                            />
                            <Button
                              size="sm"
                              variant="danger"
                              leadingIcon={<Trash2 size={14} />}
                              onClick={() => handleDeleteUser(user)}
                              title="계정 삭제"
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── User Detail Modal ── */}
        {isDetailModalOpen && selectedUser && (() => {
          const statusConfig = getUserStatusConfig(selectedUser.is_banned);
          return (
            <Modal
              isOpen={isDetailModalOpen}
              onClose={() => setIsDetailModalOpen(false)}
              title="사용자 상세 정보"
              size="md"
              footer={
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                  <Button
                    variant={selectedUser.is_banned ? 'primary' : 'danger'}
                    size="md"
                    onClick={() => handleToggleStatus(selectedUser)}
                  >
                    {statusConfig.toggleBtnLabel}
                  </Button>
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => setIsDetailModalOpen(false)}
                  >
                    닫기
                  </Button>
                </div>
              }
            >
              <div className="user-modal-box">
                {/* Header Profile Box */}
                <div className="user-modal-profile-card">
                  <div className="user-modal-avatar">
                    {selectedUser.avatar_url ? (
                      <img src={selectedUser.avatar_url} alt="" />
                    ) : (
                      <span>{(selectedUser.nickname || selectedUser.email || 'U').charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="user-modal-details">
                    <div className="user-modal-name-row">
                      <span className="user-modal-name">{selectedUser.nickname || '익명 사용자'}</span>
                      <span className={`user-status-pill ${statusConfig.badgeClass}`}>
                        {statusConfig.modalLabel}
                      </span>
                    </div>
                    <span className="user-modal-email">{selectedUser.email}</span>
                    <span className="user-modal-id">ID: {selectedUser.id}</span>
                  </div>
                </div>

                {/* 닉네임 수정 폼 */}
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <Input
                      label="닉네임 변경"
                      value={editingNickname}
                      onChange={(e) => setEditingNickname(e.target.value)}
                      placeholder="새로운 닉네임 입력"
                    />
                  </div>
                  <Button
                    variant="secondary"
                    size="md"
                    loading={isSavingNickname}
                    disabled={editingNickname.trim() === selectedUser.nickname}
                    onClick={handleSaveNickname}
                    style={{ marginBottom: '0.2rem' }}
                  >
                    변경 저장
                  </Button>
                </div>

                {/* Stats Grid */}
                <div className="user-modal-meta-grid">
                  <div className="user-modal-meta-item">
                    <span className="user-modal-meta-label">계정 상태</span>
                    <span className="user-modal-meta-val" style={{ color: statusConfig.color }}>
                      {statusConfig.label}
                    </span>
                  </div>
                  <div className="user-modal-meta-item">
                    <span className="user-modal-meta-label">인증 제공자</span>
                    <span className="user-modal-meta-val">
                      {selectedUser.provider === 'google' ? 'Google OAuth' : '이메일 로그인'}
                    </span>
                  </div>
                  <div className="user-modal-meta-item">
                    <span className="user-modal-meta-label">가입 일시</span>
                    <span className="user-modal-meta-val">{formatDateTime(selectedUser.created_at)}</span>
                  </div>
                  <div className="user-modal-meta-item">
                    <span className="user-modal-meta-label">보관 플레이리스트</span>
                    <span className="user-modal-meta-val">{selectedUser.playlist_count || 0}개 ({selectedUser.track_count || 0}곡)</span>
                  </div>
                </div>

                {/* Danger Zone */}
                <div className="user-modal-danger">
                  <div>
                    <div className="user-danger-text-title">계정 영구 삭제</div>
                    <div className="user-danger-text-desc">
                      해당 계정 및 생성된 모든 플레이리스트/데이터가 즉각 삭제됩니다.
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    style={{ color: 'var(--error, #e57373)' }}
                    onClick={() => handleDeleteUser(selectedUser)}
                  >
                    삭제
                  </Button>
                </div>
              </div>
            </Modal>
          );
        })()}
      </div>
    </AdminLayout>
  );
}
