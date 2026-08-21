import { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  Search,
  Pin,
  PinOff,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Edit2,
  RefreshCw,
  Loader2,
  Clock,
  ArrowUp,
  ArrowDown,
  Minus,
  Ban,
  User,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import { Button, Input, Select, Checkbox, Modal, Badge, KpiCard } from '../components/ui';
import { useAdmin } from '../context/AdminContext';
import { useToast } from '../context/ToastContext';
import './DashboardPage.css';
import './UsersPage.css';
import './SearchRankingPage.css';

// ── 순위 변동 뱃지 컴포넌트 (UsersPage .user-status-pill 규격) ──
const RankDiffBadge = ({ status, diff }) => {
  if (status === 'new') {
    return <span className="sr-status-pill new">NEW</span>;
  }
  if (status === 'up') {
    return (
      <span className="sr-status-pill up">
        <ArrowUp size={11} />
        {diff || 1}
      </span>
    );
  }
  if (status === 'down') {
    return (
      <span className="sr-status-pill down">
        <ArrowDown size={11} />
        {diff || 1}
      </span>
    );
  }
  return (
    <span className="sr-status-pill same">
      <Minus size={11} />
    </span>
  );
};

export default function SearchRankingPage() {
  const {
    adminKey,
    searchRankingData,
    isSearchRankingLoading,
    fetchSearchRankingData,
    pinSearchKeyword,
    unpinSearchKeyword,
    addBlacklistKeyword,
    removeBlacklistKeyword,
    addOrUpdateSearchKeyword,
    deleteSearchKeyword,
    recalculateSearchRankings,
    clearSearchLogs,
  } = useAdmin();

  const { showSuccessToast, showErrorToast } = useToast();

  // 탭 상태: 'keywords' | 'artists' | 'pinned' | 'blacklist' | 'logs'
  const [activeTab, setActiveTab] = useState('keywords');
  const [searchFilter, setSearchFilter] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all' | 'pinned' | 'normal'
  const [sortBy, setSortBy] = useState('rank'); // 'rank' | 'score' | 'name'

  // ── 모달 상태들 ──
  // 1. 키워드 등록/수정 모달
  const [isKeywordModalOpen, setIsKeywordModalOpen] = useState(false);
  const [keywordForm, setKeywordForm] = useState({ keyword: '', count: 10, isPinned: false });
  const [isKeywordSaving, setIsKeywordSaving] = useState(false);

  // 2. 금지어(블랙리스트) 추가 모달
  const [isBlacklistModalOpen, setIsBlacklistModalOpen] = useState(false);
  const [blacklistForm, setBlacklistForm] = useState({ keyword: '', reason: '부적절한 검색어' });
  const [isBlacklistSaving, setIsBlacklistSaving] = useState(false);

  useEffect(() => {
    if (adminKey) {
      fetchSearchRankingData(adminKey);
    }
  }, [adminKey]);

  const {
    trendingKeywords = [],
    trendingArtists = [],
    pinnedKeywords = [],
    blacklistedKeywords = [],
    recentLogs = [],
    stats = {},
  } = searchRankingData || {};

  // 키워드 목록 필터링 및 정렬
  const filteredKeywords = useMemo(() => {
    let list = [...trendingKeywords];

    if (filterType === 'pinned') {
      list = list.filter((item) => item.isPinned || pinnedKeywords.some((p) => p.keyword === item.keyword));
    } else if (filterType === 'normal') {
      list = list.filter((item) => !item.isPinned && !pinnedKeywords.some((p) => p.keyword === item.keyword));
    }

    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase().trim();
      list = list.filter((item) => item.keyword.toLowerCase().includes(q));
    }

    if (sortBy === 'score') {
      list.sort((a, b) => b.count - a.count);
    } else if (sortBy === 'name') {
      list.sort((a, b) => a.keyword.localeCompare(b.keyword));
    } else {
      list.sort((a, b) => a.rank - b.rank);
    }

    return list;
  }, [trendingKeywords, pinnedKeywords, searchFilter, filterType, sortBy]);

  // 아티스트 목록 필터링
  const filteredArtists = useMemo(() => {
    let list = [...trendingArtists];
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase().trim();
      list = list.filter(
        (item) => item.name.toLowerCase().includes(q) || (item.genre && item.genre.toLowerCase().includes(q)),
      );
    }
    if (sortBy === 'score') {
      list.sort((a, b) => b.count - a.count);
    } else if (sortBy === 'name') {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      list.sort((a, b) => a.rank - b.rank);
    }
    return list;
  }, [trendingArtists, searchFilter, sortBy]);

  // 고정 키워드 목록 필터링
  const filteredPinned = useMemo(() => {
    if (!searchFilter.trim()) return pinnedKeywords;
    const q = searchFilter.toLowerCase().trim();
    return pinnedKeywords.filter((item) => item.keyword.toLowerCase().includes(q));
  }, [pinnedKeywords, searchFilter]);

  // 금지어 목록 필터링
  const filteredBlacklist = useMemo(() => {
    if (!searchFilter.trim()) return blacklistedKeywords;
    const q = searchFilter.toLowerCase().trim();
    return blacklistedKeywords.filter(
      (item) => item.keyword.toLowerCase().includes(q) || (item.reason && item.reason.toLowerCase().includes(q)),
    );
  }, [blacklistedKeywords, searchFilter]);

  // 로그 목록 필터링
  const filteredLogs = useMemo(() => {
    if (!searchFilter.trim()) return recentLogs;
    const q = searchFilter.toLowerCase().trim();
    return recentLogs.filter(
      (item) =>
        item.keyword.toLowerCase().includes(q) ||
        (item.clientId && item.clientId.toLowerCase().includes(q)) ||
        (item.artistNames && item.artistNames.some((a) => a.toLowerCase().includes(q))),
    );
  }, [recentLogs, searchFilter]);

  // ── 날짜 포맷 헬퍼 (UsersPage 표준 규격) ──
  const formatDate = (timestamp) => {
    if (!timestamp) return '-';
    try {
      const d = new Date(timestamp);
      return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    } catch (e) {
      return '-';
    }
  };

  const formatDateTime = (timestamp) => {
    if (!timestamp) return '-';
    try {
      const d = new Date(timestamp);
      return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch (e) {
      return '-';
    }
  };

  // ── 핸들러 함수들 ──

  const handleRefresh = async () => {
    await fetchSearchRankingData(adminKey);
    showSuccessToast('검색어 순위 데이터를 새로고침했습니다.');
  };

  const handleTogglePin = async (keyword, isCurrentlyPinned) => {
    try {
      if (isCurrentlyPinned) {
        const res = await unpinSearchKeyword(keyword);
        if (res.success) {
          showSuccessToast(`'${keyword}' 검색어의 상위 고정을 해제했습니다.`);
        }
      } else {
        const res = await pinSearchKeyword(keyword, 1);
        if (res.success) {
          showSuccessToast(`'${keyword}' 검색어를 상위 랭킹에 고정했습니다.`);
        }
      }
    } catch (err) {
      showErrorToast('고정 상태 변경 중 오류가 발생했습니다.');
    }
  };

  const handleQuickBlacklist = async (keyword) => {
    if (!window.confirm(`'${keyword}' 검색어를 금지어로 등록하여 랭킹 및 집계에서 제외하시겠습니까?`)) {
      return;
    }
    try {
      const res = await addBlacklistKeyword(keyword, '관리자 즉시 차단');
      if (res.success) {
        showSuccessToast(`'${keyword}' 검색어가 금지어로 등록되었습니다.`, '차단 완료');
      }
    } catch (err) {
      showErrorToast('금지어 등록 중 오류가 발생했습니다.');
    }
  };

  const handleRemoveBlacklist = async (keyword) => {
    try {
      const res = await removeBlacklistKeyword(keyword);
      if (res.success) {
        showSuccessToast(`'${keyword}' 금지어가 해제되었습니다.`, '차단 해제');
      }
    } catch (err) {
      showErrorToast('금지어 해제 중 오류가 발생했습니다.');
    }
  };

  const handleDeleteKeyword = async (keyword) => {
    if (!window.confirm(`'${keyword}' 검색어의 모든 통계 및 로그를 삭제하시겠습니까?`)) {
      return;
    }
    try {
      const res = await deleteSearchKeyword(keyword);
      if (res.success) {
        showSuccessToast(`'${keyword}' 검색어 통계가 삭제되었습니다.`);
      }
    } catch (err) {
      showErrorToast('검색어 삭제 중 오류가 발생했습니다.');
    }
  };

  const handleClearLogs = async () => {
    if (!window.confirm('전체 실시간 검색 로그를 초기화하시겠습니까? (이 작업은 되돌릴 수 없습니다.)')) {
      return;
    }
    try {
      const res = await clearSearchLogs();
      if (res.success) {
        showSuccessToast('모든 검색 로그가 초기화되었습니다.');
      }
    } catch (err) {
      showErrorToast('검색 로그 초기화 중 오류가 발생했습니다.');
    }
  };

  const handleSaveKeywordModal = async (e) => {
    e.preventDefault();
    if (!keywordForm.keyword.trim()) {
      showErrorToast('검색어를 입력해주세요.');
      return;
    }

    setIsKeywordSaving(true);
    try {
      const keyword = keywordForm.keyword.trim();
      const res = await addOrUpdateSearchKeyword(keyword, Number(keywordForm.count) || 10);
      if (res.success) {
        const currentlyPinned = pinnedKeywords.some((p) => p.keyword.toLowerCase() === keyword.toLowerCase());
        if (keywordForm.isPinned && !currentlyPinned) {
          await pinSearchKeyword(keyword, 1);
        } else if (!keywordForm.isPinned && currentlyPinned) {
          await unpinSearchKeyword(keyword);
        }
        showSuccessToast(`'${keyword}' 검색어가 등록/수정되었습니다.`);
        setIsKeywordModalOpen(false);
        setKeywordForm({ keyword: '', count: 10, isPinned: false });
      }
    } catch (err) {
      showErrorToast('검색어 저장 중 오류가 발생했습니다.');
    } finally {
      setIsKeywordSaving(false);
    }
  };

  const handleSaveBlacklistModal = async (e) => {
    e.preventDefault();
    if (!blacklistForm.keyword.trim()) {
      showErrorToast('금지할 키워드를 입력해주세요.');
      return;
    }

    setIsBlacklistSaving(true);
    try {
      const res = await addBlacklistKeyword(
        blacklistForm.keyword.trim(),
        blacklistForm.reason.trim() || '관리자 차단',
      );
      if (res.success) {
        showSuccessToast(`'${blacklistForm.keyword.trim()}' 키워드가 금지어로 등록되었습니다.`);
        setIsBlacklistModalOpen(false);
        setBlacklistForm({ keyword: '', reason: '부적절한 검색어' });
      }
    } catch (err) {
      showErrorToast('금지어 등록 중 오류가 발생했습니다.');
    } finally {
      setIsBlacklistSaving(false);
    }
  };

  return (
    <AdminLayout pageTitle="검색어 순위 관리" activeTab="search-ranking">
      <div className="search-ranking-page-container">
        {/* ── 1. Top 4 KPI Metric Cards Grid (Standardized Common KpiCard Component) ── */}
        <div className="search-ranking-summary-grid">
          <KpiCard
            label="총 고유 검색어"
            value={`${(stats.totalKeywordsCount || 0).toLocaleString()}개`}
            subText={`아티스트 ${(stats.totalArtistsCount || 0).toLocaleString()}명 집계`}
            tagText="실시간 집계"
            tagVariant="info"
            topRight={<Search size={18} color="var(--color-accent-primary, #1db954)" />}
          />
          <KpiCard
            label="24시간 실시간 검색량"
            value={`${(stats.logsLast24h || 0).toLocaleString()}회`}
            subText={`누적 검색 ${(stats.totalLogsCount || 0).toLocaleString()}회`}
            tagText="활발"
            tagVariant="success"
            topRight={<TrendingUp size={18} color="var(--color-accent-primary, #1db954)" />}
          />
          <KpiCard
            label="상위 고정 검색어"
            value={`${stats.pinnedCount || 0}개`}
            subText="1위~상위 우선 노출"
            tagText={stats.pinnedCount > 0 ? '고정 활성' : '미설정'}
            tagVariant={stats.pinnedCount > 0 ? 'warning' : 'default'}
            topRight={<Pin size={18} color="var(--color-warning, #ffb74d)" />}
          />
          <KpiCard
            label="차단된 금지어"
            value={`${stats.blacklistedCount || 0}개`}
            subText="랭킹 및 검색 제외"
            tagText={stats.blacklistedCount > 0 ? '필터링 중' : '정상'}
            tagVariant={stats.blacklistedCount > 0 ? 'warning' : 'default'}
            topRight={<ShieldAlert size={18} color="var(--color-error, #e57373)" />}
          />
        </div>

        {/* ── 2. Integrated Main Search Ranking Management Card (UsersPage .users-main-card 규격) ── */}
        <div className="sr-main-card">
          {/* Card Header: Tabs (Left) & Search/Filters (Right) - UsersPage와 100% 동일 구조 */}
          <div className="sr-card-header">
            {/* Tab Buttons (insights-tab-group style) */}
            <div className="insights-tab-group">
              <button
                type="button"
                className={`insight-tab-btn ${activeTab === 'keywords' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('keywords');
                  setSearchFilter('');
                }}
              >
                <span>실시간 검색어</span>
                <span className="insights-tab-badge">{trendingKeywords.length}</span>
              </button>

              <button
                type="button"
                className={`insight-tab-btn ${activeTab === 'artists' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('artists');
                  setSearchFilter('');
                }}
              >
                <span>인기 아티스트</span>
                <span className="insights-tab-badge">{trendingArtists.length}</span>
              </button>

              <button
                type="button"
                className={`insight-tab-btn ${activeTab === 'pinned' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('pinned');
                  setSearchFilter('');
                }}
              >
                <span>고정 키워드</span>
                <span className="insights-tab-badge">{pinnedKeywords.length}</span>
              </button>

              <button
                type="button"
                className={`insight-tab-btn ${activeTab === 'blacklist' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('blacklist');
                  setSearchFilter('');
                }}
              >
                <span>금지어/차단</span>
                <span className="insights-tab-badge">{blacklistedKeywords.length}</span>
              </button>

              <button
                type="button"
                className={`insight-tab-btn ${activeTab === 'logs' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('logs');
                  setSearchFilter('');
                }}
              >
                <span>검색 로그</span>
                <span className="insights-tab-badge">{recentLogs.length}</span>
              </button>
            </div>

            {/* Search, Filters & Refresh Controls Group (UsersPage .users-toolbar-actions 규격) */}
            <div className="sr-toolbar-actions">
              {/* Search Input */}
              <div className="sr-search-wrapper">
                <Input
                  placeholder="검색어, 아티스트 검색..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  leadingIcon={<Search size={14} />}
                />
              </div>

              {/* Filter 1: Status / Category Filter */}
              <div className="sr-select-container">
                <Select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  options={[
                    { value: 'all', label: '전체 키워드' },
                    { value: 'pinned', label: '고정 키워드' },
                    { value: 'normal', label: '일반 키워드' },
                  ]}
                />
              </div>

              {/* Filter 2: Sort Order */}
              <div className="sr-select-container">
                <Select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  options={[
                    { value: 'rank', label: '순위 랭킹순' },
                    { value: 'score', label: '점수/검색순' },
                    { value: 'name', label: '이름 가나다순' },
                  ]}
                />
              </div>

              {/* Refresh Icon Button */}
              <Button
                size="md"
                variant="secondary"
                leadingIcon={<RefreshCw size={14} />}
                loading={isSearchRankingLoading}
                onClick={handleRefresh}
                title="새로고침"
              />
            </div>
          </div>

          {/* Card Body: Table Container with Overflow Guard */}
          <div className="sr-table-card">
            {isSearchRankingLoading && trendingKeywords.length === 0 ? (
              <div className="empty-state">
                <Loader2 size={24} className="animate-spin-slow" />
                <p className="empty-state-text">검색어 랭킹 데이터 불러오는 중...</p>
              </div>
            ) : null}

            {/* [TAB 1] 실시간 검색어 순위 */}
            {activeTab === 'keywords' && (
              filteredKeywords.length === 0 && !isSearchRankingLoading ? (
                <div className="empty-state">
                  <Search size={32} />
                  <p className="empty-state-text">일치하는 검색어가 없습니다.</p>
                </div>
              ) : (
                <table className="sr-table">
                  <thead>
                    <tr>
                      <th style={{ width: '8%', textAlign: 'center' }}>순위</th>
                      <th style={{ width: '8%', textAlign: 'center' }}>변동</th>
                      <th style={{ width: '38%' }}>검색 키워드</th>
                      <th style={{ width: '22%' }}>인기도 점수</th>
                      <th style={{ width: '12%', textAlign: 'center' }}>고정 상태</th>
                      <th style={{ width: '12%', textAlign: 'right' }}>관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredKeywords.map((item) => {
                      const isPinned = Boolean(
                        item.isPinned || pinnedKeywords.some((p) => p.keyword === item.keyword),
                      );
                      const rankNumberClass =
                        item.rank === 1 ? 'rank-1' : item.rank === 2 ? 'rank-2' : item.rank === 3 ? 'rank-3' : '';

                      return (
                        <tr key={item.keyword}>
                          {/* Rank Number */}
                          <td style={{ textAlign: 'center' }}>
                            <span className={`sr-rank-number ${rankNumberClass}`}>
                              {item.rank}
                            </span>
                          </td>

                          {/* Diff Status */}
                          <td style={{ textAlign: 'center' }}>
                            <RankDiffBadge status={item.status} diff={item.diff} />
                          </td>

                          {/* Keyword Profile */}
                          <td>
                            <div className="sr-profile-flex">
                              <div className="sr-profile-meta">
                                <span className="sr-profile-name">
                                  {item.keyword}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Activity / Score */}
                          <td>
                            <div className="sr-activity-group">
                              <span className="sr-activity-main">
                                {item.count.toLocaleString()} 점
                              </span>
                            </div>
                          </td>

                          {/* Pinned Status Pill */}
                          <td style={{ textAlign: 'center' }}>
                            <span className={`sr-status-pill ${isPinned ? 'pinned' : 'same'}`}>
                              {isPinned ? '고정됨' : '일반'}
                            </span>
                          </td>

                          {/* Actions */}
                          <td style={{ textAlign: 'right' }}>
                            <div className="sr-table-actions">
                              <Button
                                size="sm"
                                variant={isPinned ? 'primary' : 'secondary'}
                                onClick={() => handleTogglePin(item.keyword, isPinned)}
                                title={isPinned ? '고정 해제' : '상위 랭킹 고정'}
                                leadingIcon={isPinned ? <PinOff size={13} /> : <Pin size={13} />}
                              />
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  setKeywordForm({
                                    keyword: item.keyword,
                                    count: item.count,
                                    isPinned,
                                  });
                                  setIsKeywordModalOpen(true);
                                }}
                                title="점수/검색량 수정"
                                leadingIcon={<Edit2 size={13} />}
                              />
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleQuickBlacklist(item.keyword)}
                                title="금지어로 등록하여 랭킹에서 제외"
                                leadingIcon={<Ban size={13} />}
                              />
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => handleDeleteKeyword(item.keyword)}
                                title="검색어 완전 삭제"
                                leadingIcon={<Trash2 size={13} />}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )
            )}

            {/* [TAB 2] 인기 아티스트 순위 */}
            {activeTab === 'artists' && (
              filteredArtists.length === 0 && !isSearchRankingLoading ? (
                <div className="empty-state">
                  <User size={32} />
                  <p className="empty-state-text">일치하는 인기 아티스트가 없습니다.</p>
                </div>
              ) : (
                <table className="sr-table">
                  <thead>
                    <tr>
                      <th style={{ width: '8%', textAlign: 'center' }}>순위</th>
                      <th style={{ width: '8%', textAlign: 'center' }}>변동</th>
                      <th style={{ width: '40%' }}>아티스트 프로필</th>
                      <th style={{ width: '18%' }}>대표 장르</th>
                      <th style={{ width: '16%' }}>인기도 점수</th>
                      <th style={{ width: '10%', textAlign: 'right' }}>관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredArtists.map((artist) => {
                      const rankNumberClass =
                        artist.rank === 1 ? 'rank-1' : artist.rank === 2 ? 'rank-2' : artist.rank === 3 ? 'rank-3' : '';

                      return (
                        <tr key={artist.name}>
                          <td style={{ textAlign: 'center' }}>
                            <span className={`sr-rank-number ${rankNumberClass}`}>
                              {artist.rank}
                            </span>
                          </td>

                          <td style={{ textAlign: 'center' }}>
                            <RankDiffBadge status={artist.status} diff={artist.diff} />
                          </td>

                          <td>
                            <div className="sr-profile-flex">
                              <div className="sr-avatar-box">
                                {artist.thumbnail ? (
                                  <img
                                    src={artist.thumbnail}
                                    alt={artist.name}
                                    className="sr-avatar-img"
                                    onError={(e) => {
                                      e.target.style.display = 'none';
                                    }}
                                  />
                                ) : (
                                  <User size={18} color="var(--text-muted)" />
                                )}
                              </div>
                              <div className="sr-profile-meta">
                                <span className="sr-profile-name">{artist.name}</span>
                              </div>
                            </div>
                          </td>

                          <td>
                            {artist.genre ? (
                              <Badge variant="neutral" size="sm">
                                {artist.genre}
                              </Badge>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>-</span>
                            )}
                          </td>

                          <td>
                            <div className="sr-activity-group">
                              <span className="sr-activity-main">{artist.count.toLocaleString()} 점</span>
                            </div>
                          </td>

                          <td style={{ textAlign: 'right' }}>
                            <div className="sr-table-actions">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleQuickBlacklist(artist.name)}
                                title="아티스트를 금지어로 등록하여 랭킹에서 제외"
                                leadingIcon={<Ban size={13} />}
                              >
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )
            )}

            {/* [TAB 3] 고정 키워드 관리 */}
            {activeTab === 'pinned' && (
              filteredPinned.length === 0 && !isSearchRankingLoading ? (
                <div className="empty-state">
                  <Pin size={32} />
                  <p className="empty-state-text">고정된 검색어가 없습니다.</p>
                </div>
              ) : (
                <table className="sr-table">
                  <thead>
                    <tr>
                      <th style={{ width: '15%', textAlign: 'center' }}>우선 순위</th>
                      <th style={{ width: '45%' }}>고정 키워드</th>
                      <th style={{ width: '25%' }}>고정 등록 일시</th>
                      <th style={{ width: '15%', textAlign: 'right' }}>관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPinned.map((item, idx) => (
                      <tr key={item.keyword}>
                        <td style={{ textAlign: 'center' }}>
                          <span className="sr-status-pill pinned">
                            {item.rank ? `${item.rank}위 우선` : `${idx + 1}위`}
                          </span>
                        </td>

                        <td>
                          <div className="sr-profile-flex">
                            <div className="sr-profile-meta">
                              <span className="sr-profile-name">{item.keyword}</span>
                            </div>
                          </div>
                        </td>

                        <td>
                          <div className="sr-date-group">
                            <span className="sr-date-main">{formatDate(item.pinnedAt)}</span>
                            <span className="sr-date-sub">{formatDateTime(item.pinnedAt)}</span>
                          </div>
                        </td>

                        <td style={{ textAlign: 'right' }}>
                          <div className="sr-table-actions">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                const trendItem = trendingKeywords.find((k) => k.keyword === item.keyword);
                                setKeywordForm({
                                  keyword: item.keyword,
                                  count: trendItem ? trendItem.count : 1000,
                                  isPinned: true,
                                });
                                setIsKeywordModalOpen(true);
                              }}
                              title="점수/가중치 수정"
                              leadingIcon={<Edit2 size={13} />}
                            />
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleTogglePin(item.keyword, true)}
                              title="고정 해제"
                              leadingIcon={<PinOff size={13} />}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}

            {/* [TAB 4] 금지어 / 블랙리스트 관리 */}
            {activeTab === 'blacklist' && (
              filteredBlacklist.length === 0 && !isSearchRankingLoading ? (
                <div className="empty-state">
                  <ShieldCheck size={32} style={{ color: 'var(--color-accent-primary, #1db954)' }} />
                  <p className="empty-state-text">등록된 금지어가 없습니다.</p>
                </div>
              ) : (
                <table className="sr-table">
                  <thead>
                    <tr>
                      <th style={{ width: '35%' }}>금지 키워드</th>
                      <th style={{ width: '35%' }}>차단 사유</th>
                      <th style={{ width: '20%' }}>등록 일시</th>
                      <th style={{ width: '10%', textAlign: 'right' }}>관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBlacklist.map((item) => (
                      <tr key={item.keyword}>
                        <td>
                          <div className="sr-profile-flex">
                            <div className="sr-avatar-box" style={{ background: 'rgba(229, 115, 115, 0.1)', borderColor: 'rgba(229, 115, 115, 0.25)' }}>
                              <Ban size={16} color="var(--error, #e57373)" />
                            </div>
                            <div className="sr-profile-meta">
                              <span className="sr-profile-name">{item.keyword}</span>
                            </div>
                          </div>
                        </td>

                        <td>
                          <span className="sr-status-pill banned">
                            {item.reason || '관리자 차단'}
                          </span>
                        </td>

                        <td>
                          <div className="sr-date-group">
                            <span className="sr-date-main">{formatDate(item.addedAt)}</span>
                            <span className="sr-date-sub">{formatDateTime(item.addedAt)}</span>
                          </div>
                        </td>

                        <td style={{ textAlign: 'right' }}>
                          <div className="sr-table-actions">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleRemoveBlacklist(item.keyword)}
                            >
                              차단 해제
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}

            {/* [TAB 5] 실시간 검색 로그 */}
            {activeTab === 'logs' && (
              filteredLogs.length === 0 && !isSearchRankingLoading ? (
                <div className="empty-state">
                  <Clock size={32} />
                  <p className="empty-state-text">기록된 검색 로그가 없습니다.</p>
                </div>
              ) : (
                <table className="sr-table">
                  <thead>
                    <tr>
                      <th style={{ width: '18%' }}>검색 발생 시각</th>
                      <th style={{ width: '26%' }}>검색 키워드</th>
                      <th style={{ width: '18%' }}>클라이언트 식별자</th>
                      <th style={{ width: '16%' }}>연관 아티스트</th>
                      <th style={{ width: '14%', textAlign: 'center' }}>집계 상태</th>
                      <th style={{ width: '8%', textAlign: 'right' }}>관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map((log, idx) => (
                      <tr key={`${log.timestamp}-${idx}`}>
                        <td>
                          <div className="sr-date-group">
                            <span className="sr-date-main">{formatDateTime(log.timestamp)}</span>
                            <span className="sr-date-sub">{formatDate(log.timestamp)}</span>
                          </div>
                        </td>

                        <td>
                          <div className="sr-profile-flex">
                            <div className="sr-profile-meta">
                              <span className="sr-profile-name">{log.keyword}</span>
                            </div>
                          </div>
                        </td>

                        <td>
                          <span style={{ color: 'var(--text-muted, #777777)', fontFamily: 'monospace', fontSize: '0.725rem' }}>
                            {log.clientId || '-'}
                          </span>
                        </td>

                        <td>
                          {log.artistNames && log.artistNames.length > 0 ? (
                            <div className="sr-log-artists">
                              {log.artistNames.map((art) => (
                                <span key={art} className="sr-log-artist-pill">
                                  {art}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>-</span>
                          )}
                        </td>

                        <td style={{ textAlign: 'center' }}>
                          {log.counted === false ? (
                            <span
                              className="sr-status-pill same"
                              title={log.filterReason || '어뷰징/중복 방지 제한'}
                              style={{ color: 'var(--text-muted)', background: 'rgba(255, 255, 255, 0.05)' }}
                            >
                              점수 미반영
                            </span>
                          ) : (
                            <span className="sr-status-pill new">
                              유효 반영
                            </span>
                          )}
                        </td>

                        <td style={{ textAlign: 'right' }}>
                          <div className="sr-table-actions">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleQuickBlacklist(log.keyword)}
                              title="금지어로 등록"
                              leadingIcon={<Ban size={13} />}
                            >
                              차단
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
          </div>
        </div>
      </div>

      {/* ── 모달 1: 검색어 수동 등록 / 점수 수정 ── */}
      <Modal
        isOpen={isKeywordModalOpen}
        onClose={() => setIsKeywordModalOpen(false)}
        title="검색어 수동 등록 및 점수 수정"
      >
        <form onSubmit={handleSaveKeywordModal}>
          <div className="sr-form-group">
            <label className="sr-form-label">검색 키워드</label>
            <Input
              placeholder="예: 아이유, NewJeans, 팝송"
              value={keywordForm.keyword}
              onChange={(e) => setKeywordForm({ ...keywordForm, keyword: e.target.value })}
              autoFocus
            />
          </div>

          <div className="sr-form-group">
            <label className="sr-form-label">인기도 점수 / 가중치 (Score)</label>
            <Input
              type="number"
              min="1"
              max="9999999"
              placeholder="예: 10000 (점수가 높을수록 1위/상위권 노출)"
              value={keywordForm.count}
              onChange={(e) => setKeywordForm({ ...keywordForm, count: e.target.value })}
            />
            <span className="sr-form-help">점수가 높을수록 실시간 순위의 상위권(1위, 2위, 3위…)에 우선 배치됩니다.</span>
          </div>

          <div className="sr-form-group" style={{ marginTop: '4px' }}>
            <Checkbox
              id="keyword_form_is_pinned"
              label="상위 랭킹에 고정하기 (Pin)"
              checked={keywordForm.isPinned}
              onChange={(e) => setKeywordForm({ ...keywordForm, isPinned: e.target.checked })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
            <Button type="button" variant="secondary" onClick={() => setIsKeywordModalOpen(false)}>
              취소
            </Button>
            <Button type="submit" variant="primary" disabled={isKeywordSaving}>
              {isKeywordSaving ? '저장 중...' : '저장하기'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── 모달 2: 금지어(블랙리스트) 추가 ── */}
      <Modal
        isOpen={isBlacklistModalOpen}
        onClose={() => setIsBlacklistModalOpen(false)}
        title="금지어 / 블랙리스트 등록"
      >
        <form onSubmit={handleSaveBlacklistModal}>
          <div className="sr-form-group">
            <label className="sr-form-label">금지 키워드</label>
            <Input
              placeholder="차단할 단어 또는 검색어 입력"
              value={blacklistForm.keyword}
              onChange={(e) => setBlacklistForm({ ...blacklistForm, keyword: e.target.value })}
              autoFocus
            />
          </div>

          <div className="sr-form-group">
            <label className="sr-form-label">차단 사유</label>
            <Input
              placeholder="예: 욕설/비하, 어뷰징 스팸, 부적절한 홍보"
              value={blacklistForm.reason}
              onChange={(e) => setBlacklistForm({ ...blacklistForm, reason: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
            <Button type="button" variant="secondary" onClick={() => setIsBlacklistModalOpen(false)}>
              취소
            </Button>
            <Button type="submit" variant="primary" disabled={isBlacklistSaving}>
              {isBlacklistSaving ? '등록 중...' : '금지어로 등록'}
            </Button>
          </div>
        </form>
      </Modal>
    </AdminLayout>
  );
}
