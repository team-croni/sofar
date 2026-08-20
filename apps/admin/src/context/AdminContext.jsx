import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';

const AdminContext = createContext(null);
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function AdminProvider({ children }) {
  const [adminKey, setAdminKey] = useState(() => 
    sessionStorage.getItem('sofar_admin_key') || localStorage.getItem('sofar_admin_key') || ''
  );
  const [isLoggedIn, setIsLoggedIn] = useState(() => 
    !!(sessionStorage.getItem('sofar_admin_key') || localStorage.getItem('sofar_admin_key'))
  );

  const [playlists, setPlaylists] = useState([]);
  const [userPlaylists, setUserPlaylists] = useState([]);
  const [users, setUsers] = useState([]);
  const [userStats, setUserStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    bannedUsers: 0,
    newUsersThisWeek: 0,
    googleUsersCount: 0,
    emailUsersCount: 0,
    totalUserPlaylists: 0,
    totalUserTracks: 0,
  });
  const [dashboardInsights, setDashboardInsights] = useState({
    mismatchTracks: [],
    dailyTopSongs: [],
    dailyTopPlaylists: [],
  });
  const [searchRankingData, setSearchRankingData] = useState({
    trendingKeywords: [],
    trendingArtists: [],
    pinnedKeywords: [],
    blacklistedKeywords: [],
    recentLogs: [],
    stats: {
      totalKeywordsCount: 0,
      totalArtistsCount: 0,
      totalLogsCount: 0,
      logsLast24h: 0,
      pinnedCount: 0,
      blacklistedCount: 0,
      topKeyword: '-',
    },
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isUserLoading, setIsUserLoading] = useState(false);
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [isInsightsLoading, setIsInsightsLoading] = useState(false);
  const [isSearchRankingLoading, setIsSearchRankingLoading] = useState(false);
  const [isFetched, setIsFetched] = useState(false);


  const fetchPlaylists = async (key = adminKey) => {
    if (!key) return;
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/playlists`, {
        headers: { 'x-admin-key': key },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setPlaylists(json.data);
        }
      }
    } catch (err) {
      console.error('Failed to fetch admin playlists:', err);
    } finally {
      setIsLoading(false);
      setIsFetched(true);
    }
  };

  const fetchUserPlaylists = async (key = adminKey) => {
    if (!key) return;
    setIsUserLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/user-playlists`, {
        headers: { 'x-admin-key': key },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setUserPlaylists(json.data);
        }
      }
    } catch (err) {
      console.error('Failed to fetch user playlists:', err);
    } finally {
      setIsUserLoading(false);
    }
  };

  const fetchUsers = async (key = adminKey) => {
    if (!key) return;
    setIsUsersLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/users`, {
        headers: { 'x-admin-key': key },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setUsers(json.data);
        }
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setIsUsersLoading(false);
    }
  };

  const fetchUserStats = async (key = adminKey) => {
    if (!key) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/user-stats`, {
        headers: { 'x-admin-key': key },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setUserStats(json.data);
        }
      }
    } catch (err) {
      console.error('Failed to fetch user stats:', err);
    }
  };

  const updateUserStatus = async (userId, updatePayload) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey,
        },
        body: JSON.stringify(updatePayload),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === userId
              ? {
                  ...u,
                  ...updatePayload,
                  status: updatePayload.is_banned !== undefined ? (updatePayload.is_banned ? 'banned' : 'active') : u.status,
                  is_banned: updatePayload.is_banned !== undefined ? updatePayload.is_banned : u.is_banned,
                }
              : u
          )
        );
        fetchUserStats(adminKey);
        return true;
      }
    } catch (err) {
      console.error('Failed to update user:', err);
    }
    return false;
  };

  const deleteUser = async (userId) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        headers: {
          'x-admin-key': adminKey,
        },
      });
      if (res.ok) {
        setUsers((prev) => prev.filter((u) => u.id !== userId));
        fetchUserStats(adminKey);
        fetchUserPlaylists(adminKey);
        return true;
      }
    } catch (err) {
      console.error('Failed to delete user:', err);
    }
    return false;
  };

  const fetchDashboardInsights = async (key = adminKey) => {
    if (!key) return;
    setIsInsightsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/dashboard-insights`, {
        headers: { 'x-admin-key': key },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setDashboardInsights(json.data);
        }
      }
    } catch (err) {
      console.error('Failed to fetch dashboard insights:', err);
    } finally {
      setIsInsightsLoading(false);
    }
  };

  const fetchSearchRankingData = async (key = adminKey) => {
    if (!key) return;
    setIsSearchRankingLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/search-ranking`, {
        headers: { 'x-admin-key': key },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setSearchRankingData(json.data);
        }
      }
    } catch (err) {
      console.error('Failed to fetch search ranking data:', err);
    } finally {
      setIsSearchRankingLoading(false);
    }
  };

  const pinSearchKeyword = async (keyword, rank = 1) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/search-ranking/pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey,
        },
        body: JSON.stringify({ keyword, rank }),
      });
      if (res.ok) {
        await fetchSearchRankingData(adminKey);
        return { success: true };
      }
    } catch (err) {
      console.error('Failed to pin search keyword:', err);
    }
    return { success: false };
  };

  const unpinSearchKeyword = async (keyword) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/search-ranking/pin/${encodeURIComponent(keyword)}`, {
        method: 'DELETE',
        headers: { 'x-admin-key': adminKey },
      });
      if (res.ok) {
        await fetchSearchRankingData(adminKey);
        return { success: true };
      }
    } catch (err) {
      console.error('Failed to unpin search keyword:', err);
    }
    return { success: false };
  };

  const addBlacklistKeyword = async (keyword, reason = '관리자 차단') => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/search-ranking/blacklist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey,
        },
        body: JSON.stringify({ keyword, reason }),
      });
      if (res.ok) {
        await fetchSearchRankingData(adminKey);
        return { success: true };
      }
    } catch (err) {
      console.error('Failed to add blacklist keyword:', err);
    }
    return { success: false };
  };

  const removeBlacklistKeyword = async (keyword) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/search-ranking/blacklist/${encodeURIComponent(keyword)}`, {
        method: 'DELETE',
        headers: { 'x-admin-key': adminKey },
      });
      if (res.ok) {
        await fetchSearchRankingData(adminKey);
        return { success: true };
      }
    } catch (err) {
      console.error('Failed to remove blacklist keyword:', err);
    }
    return { success: false };
  };

  const addOrUpdateSearchKeyword = async (keyword, count = 1) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/search-ranking/keyword`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey,
        },
        body: JSON.stringify({ keyword, count }),
      });
      if (res.ok) {
        await fetchSearchRankingData(adminKey);
        return { success: true };
      }
    } catch (err) {
      console.error('Failed to add/update search keyword:', err);
    }
    return { success: false };
  };

  const deleteSearchKeyword = async (keyword) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/search-ranking/keyword/${encodeURIComponent(keyword)}`, {
        method: 'DELETE',
        headers: { 'x-admin-key': adminKey },
      });
      if (res.ok) {
        await fetchSearchRankingData(adminKey);
        return { success: true };
      }
    } catch (err) {
      console.error('Failed to delete search keyword:', err);
    }
    return { success: false };
  };

  const recalculateSearchRankings = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/search-ranking/recalculate`, {
        method: 'POST',
        headers: { 'x-admin-key': adminKey },
      });
      if (res.ok) {
        await fetchSearchRankingData(adminKey);
        return { success: true };
      }
    } catch (err) {
      console.error('Failed to recalculate search rankings:', err);
    }
    return { success: false };
  };

  const clearSearchLogs = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/search-ranking/clear-logs`, {
        method: 'POST',
        headers: { 'x-admin-key': adminKey },
      });
      if (res.ok) {
        await fetchSearchRankingData(adminKey);
        return { success: true };
      }
    } catch (err) {
      console.error('Failed to clear search logs:', err);
    }
    return { success: false };
  };

  const resolveMismatch = async (searchQuery, videoId, targetStatus = 'resolved') => {

    try {
      const res = await fetch(`${API_BASE}/api/admin/resolve-mismatch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey,
        },
        body: JSON.stringify({ searchQuery, youtube_video_id: videoId, status: targetStatus }),
      });
      if (res.ok) {
        // 기록을 삭제하지 않고 상태만 업데이트하여 목록에 영구 보존!
        setDashboardInsights((prev) => ({
          ...prev,
          mismatchTracks: prev.mismatchTracks.map((t) => {
            const isMatch =
              (searchQuery && t.searchQuery?.toLowerCase() === searchQuery.toLowerCase()) ||
              (videoId && t.youtube_video_id === videoId);
            if (isMatch) {
              return {
                ...t,
                status: targetStatus,
                resolvedAt: targetStatus === 'resolved' ? Date.now() : undefined,
              };
            }
            return t;
          }),
        }));
        // 백엔드 전체 최신 데이터 동기화
        if (adminKey) {
          fetchDashboardInsights(adminKey);
        }
        return true;
      }
    } catch (err) {
      console.error('Failed to resolve mismatch:', err);
    }
    return false;
  };

  const login = async (keyInput) => {
    const key = keyInput.trim();
    const res = await fetch(`${API_BASE}/api/admin/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': key,
      },
    });

    if (res.ok) {
      sessionStorage.setItem('sofar_admin_key', key);
      setAdminKey(key);
      setIsLoggedIn(true);
      fetchPlaylists(key);
      fetchUserPlaylists(key);
      fetchUsers(key);
      fetchUserStats(key);
      fetchDashboardInsights(key);
      fetchSearchRankingData(key);
      return { success: true };
    }
    return { success: false, message: '올바르지 않은 관리자 API Key입니다.' };
  };

  const logout = () => {
    sessionStorage.removeItem('sofar_admin_key');
    localStorage.removeItem('sofar_admin_key');
    setAdminKey('');
    setIsLoggedIn(false);
    setPlaylists([]);
    setUserPlaylists([]);
    setUsers([]);
    setUserStats({
      totalUsers: 0,
      activeUsers: 0,
      bannedUsers: 0,
      newUsersThisWeek: 0,
      googleUsersCount: 0,
      emailUsersCount: 0,
      totalUserPlaylists: 0,
      totalUserTracks: 0,
    });
    setDashboardInsights({ mismatchTracks: [], dailyTopSongs: [], dailyTopPlaylists: [] });
    setSearchRankingData({
      trendingKeywords: [],
      trendingArtists: [],
      pinnedKeywords: [],
      blacklistedKeywords: [],
      recentLogs: [],
      stats: {
        totalKeywordsCount: 0,
        totalArtistsCount: 0,
        totalLogsCount: 0,
        logsLast24h: 0,
        pinnedCount: 0,
        blacklistedCount: 0,
        topKeyword: '-',
      },
    });
    setSongInput('');
    setSongResults([]);
    setSongHasSearched(false);
    setLastSearchedSongQuery('');
    setYoutubeInput('');
    setYoutubeResults([]);
    setYoutubeHasSearched(false);
    setLastSearchedYoutubeQuery('');
    setIsRightSidebarOpen(false);
    setSelectedDetail(null);
    setIsFetched(false);
  };

  useEffect(() => {
    const savedKey = sessionStorage.getItem('sofar_admin_key') || localStorage.getItem('sofar_admin_key');
    if (savedKey) {
      fetchPlaylists(savedKey);
      fetchUserPlaylists(savedKey);
      fetchUsers(savedKey);
      fetchUserStats(savedKey);
      fetchDashboardInsights(savedKey);
      fetchSearchRankingData(savedKey);
    }
  }, []);

  const counts = useMemo(() => ({
    all: playlists.length,
    theme: playlists.filter((p) => p.category === 'theme').length,
    situation: playlists.filter((p) => p.category === 'situation').length,
    genre: playlists.filter((p) => p.category === 'genre').length,
    user_shared: userPlaylists.length,
    users: users.length,
    searchKeywords: searchRankingData.stats?.totalKeywordsCount || 0,
  }), [playlists, userPlaylists, users, searchRankingData]);


  // 사이드바 상태 (서브메뉴 토글 및 접힘 상태 로컬스토리지 동기화)
  const [isCurationSubmenuOpen, setIsCurationSubmenuOpen] = useState(() => {
    const saved = localStorage.getItem('sofar_admin_curation_submenu_open');
    return saved !== null ? saved === 'true' : true;
  });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem('sofar_admin_sidebar_collapsed') === 'true';
  });

  // 오른쪽 사이드바 (유튜브 수동 매칭 패널) 상태 로컬스토리지 동기화
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(() => {
    return localStorage.getItem('sofar_admin_right_sidebar_open') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('sofar_admin_sidebar_collapsed', String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  useEffect(() => {
    localStorage.setItem('sofar_admin_curation_submenu_open', String(isCurationSubmenuOpen));
  }, [isCurationSubmenuOpen]);

  useEffect(() => {
    localStorage.setItem('sofar_admin_right_sidebar_open', String(isRightSidebarOpen));
  }, [isRightSidebarOpen]);

  const [rightSidebarTab, setRightSidebarTab] = useState('song'); // 'song' | 'youtube'
  const [rightSidebarQuery, setRightSidebarQuery] = useState('');

  // 오른쪽 사이드바 검색 상태 (페이지 이동 시에도 영구 유지)
  const [songInput, setSongInput] = useState('');
  const [songResults, setSongResults] = useState([]);
  const [songLoading, setSongLoading] = useState(false);
  const [songHasSearched, setSongHasSearched] = useState(false);
  const [lastSearchedSongQuery, setLastSearchedSongQuery] = useState('');

  const [youtubeInput, setYoutubeInput] = useState('');
  const [youtubeResults, setYoutubeResults] = useState([]);
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const [youtubeHasSearched, setYoutubeHasSearched] = useState(false);
  const [lastSearchedYoutubeQuery, setLastSearchedYoutubeQuery] = useState('');

  const toggleRightSidebar = () => {
    setIsRightSidebarOpen((prev) => !prev);
  };

  const searchYoutubeFromSong = (artist, title) => {
    const q = `${artist || ''} ${title || ''}`.trim();
    setRightSidebarQuery(q);
    setYoutubeInput(q);
    setRightSidebarTab('youtube');
    setIsRightSidebarOpen(true);
  };

  // 전역 검색 결과 상세 모달 상태 ({ type: 'song' | 'youtube', item: object, fromSong?: object })
  const [selectedDetail, setSelectedDetail] = useState(null);

  const openSongDetail = (song) => {
    if (!song) return;
    const ytid = song.youtube_video_id || song.youtubeId || song.vid || '';
    const artwork = song.artwork || song.thumbnail || song.cover || song.cover_url || (ytid ? `https://img.youtube.com/vi/${ytid}/hqdefault.jpg` : '');
    const itunesId = song.itunes_track_id || song.itunesTrackId || (typeof song.id === 'number' || (typeof song.id === 'string' && /^\d+$/.test(song.id)) ? song.id : '');

    const songObj = {
      id: itunesId || song.id || '',
      itunesTrackId: itunesId,
      title: song.title || song.custom_title || '제목 없음',
      artist: song.artist || song.custom_artist || '아티스트 없음',
      album: song.album || song.playlistTitle || '',
      durationSec: song.durationSec || song.duration_seconds || 0,
      artwork: artwork || '',
      youtube_video_id: ytid,
      mismatchCount: song.mismatchCount || 0,
      searchQuery: song.searchQuery || '',
      isMismatchReport: Boolean(song.mismatchCount && song.mismatchCount > 0),
      mismatchLogs: Array.isArray(song.logs) ? song.logs : (song.mismatchLogs || []),
      status: song.status || 'pending',
      resolvedAt: song.resolvedAt,
    };
    setSelectedDetail({ type: 'song', item: songObj });
  };

  const openYoutubeDetail = (yt, fromSong = null) => {
    if (!yt) return;
    setSelectedDetail({ type: 'youtube', item: yt, fromSong });
  };

  const closeDetailModal = () => {
    setSelectedDetail(null);
  };

  const value = {
    adminKey,
    isLoggedIn,
    playlists,
    setPlaylists,
    userPlaylists,
    setUserPlaylists,
    users,
    setUsers,
    userStats,
    setUserStats,
    dashboardInsights,
    setDashboardInsights,
    searchRankingData,
    setSearchRankingData,
    isLoading,
    isUserLoading,
    isUsersLoading,
    isInsightsLoading,
    isSearchRankingLoading,
    isFetched,
    counts,
    fetchPlaylists,
    fetchUserPlaylists,
    fetchUsers,
    fetchUserStats,
    updateUserStatus,
    deleteUser,
    fetchDashboardInsights,
    resolveMismatch,
    fetchSearchRankingData,
    pinSearchKeyword,
    unpinSearchKeyword,
    addBlacklistKeyword,
    removeBlacklistKeyword,
    addOrUpdateSearchKeyword,
    deleteSearchKeyword,
    recalculateSearchRankings,
    clearSearchLogs,
    login,
    logout,

    // 사이드바 상태
    isCurationSubmenuOpen,
    setIsCurationSubmenuOpen,
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    // 오른쪽 사이드바 상태 및 액션
    isRightSidebarOpen,
    setIsRightSidebarOpen,
    toggleRightSidebar,
    rightSidebarTab,
    setRightSidebarTab,
    rightSidebarQuery,
    setRightSidebarQuery,
    searchYoutubeFromSong,
    // 오른쪽 사이드바 검색 상태
    songInput,
    setSongInput,
    songResults,
    setSongResults,
    songLoading,
    setSongLoading,
    songHasSearched,
    setSongHasSearched,
    lastSearchedSongQuery,
    setLastSearchedSongQuery,
    youtubeInput,
    setYoutubeInput,
    youtubeResults,
    setYoutubeResults,
    youtubeLoading,
    setYoutubeLoading,
    youtubeHasSearched,
    setYoutubeHasSearched,
    lastSearchedYoutubeQuery,
    setLastSearchedYoutubeQuery,
    // 전역 상세 모달 관리
    selectedDetail,
    setSelectedDetail,
    openSongDetail,
    openYoutubeDetail,
    closeDetailModal,
  };

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin() {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error('useAdmin must be used within an AdminProvider');
  }
  return context;
}
