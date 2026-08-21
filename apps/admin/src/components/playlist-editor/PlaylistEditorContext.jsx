import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAdmin } from '../../context/AdminContext';
import { useToast } from '../../context/ToastContext';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const PlaylistEditorContext = createContext(null);

export function PlaylistEditorProvider({ children }) {
  const queryClient = useQueryClient();
  const {
    isRightSidebarOpen,
    fetchPlaylists,
    fetchUserPlaylists,
    fetchDashboardInsights,
  } = useAdmin();
  const { showErrorToast, showSuccessToast, showWarningToast, showInfoToast } = useToast();
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const isUserType = searchParams.get('type') === 'user';
  const isReadonly = searchParams.get('readonly') === 'true';
  const isNew = !id || id === 'new';
  const isSystem = Boolean(id && id.startsWith('cat-'));

  const [adminKey, setAdminKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // 폼 상태
  const [formData, setFormData] = useState({
    title: '',
    subtitle: '',
    category: 'theme',
    category_label: 'sofar',
    cover: '',
    tags: '',
    author: 'sofar',
    is_active: true,
    tracks: [],
  });

  // 줄글 일괄 붙여넣기 모달 상태
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteMode, setPasteMode] = useState('append');

  // 상단 음원 실시간 자동완성 검색 상태
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // 유튜브/URL 가져오기 모달 상태
  const [isLinkImportModalOpen, setIsLinkImportModalOpen] = useState(false);
  const [linkImportText, setLinkImportText] = useState('');
  const [isImportingLinks, setIsImportingLinks] = useState(false);

  // 인기 차트 & 기존 플레이리스트 피커 모달 상태
  const [isPickerModalOpen, setIsPickerModalOpen] = useState(false);
  const [pickerTab, setPickerTab] = useState('popular'); // 'popular' | 'playlists'
  const [selectedPlaylistId, setSelectedPlaylistId] = useState('');
  const [selectedPlaylistTracks, setSelectedPlaylistTracks] = useState([]);
  const [checkedPickerTracks, setCheckedPickerTracks] = useState(new Set());

  // 노래 상세 정보 모달 상태 { track, index }
  const [selectedTrackDetail, setSelectedTrackDetail] = useState(null);

  // 드래그 앤 드롭 상태
  const [isDragOverDropZone, setIsDragOverDropZone] = useState(false);
  const [dropTargetIndex, setDropTargetIndex] = useState(null);
  const [draggingTrackIndex, setDraggingTrackIndex] = useState(null);
  const draggingTrackIndexRef = React.useRef(null);
  const dropTargetIndexRef = React.useRef(null);

  const setDraggingTrackIndexWithRef = (idx) => {
    draggingTrackIndexRef.current = idx;
    setDraggingTrackIndex(idx);
  };

  // 어드민 키 초기화
  useEffect(() => {
    const saved = sessionStorage.getItem('sofar_admin_key') || localStorage.getItem('sofar_admin_key');
    if (saved) setAdminKey(saved);
  }, []);

  // ── TanStack Query: 상세 정보 페칭 ──
  const {
    data: fetchedPlaylistDetail,
    isLoading: isDetailLoading,
    error: detailError,
  } = useQuery({
    queryKey: ['playlistDetail', id, isUserType, adminKey],
    queryFn: async () => {
      const endpoint = isUserType
        ? `${API_BASE}/api/admin/user-playlists/${id}`
        : `${API_BASE}/api/admin/playlists/${id}`;
      const res = await fetch(endpoint, {
        headers: { 'x-admin-key': adminKey },
      });
      if (!res.ok) throw new Error('플레이리스트 정보를 가져올 수 없습니다.');
      const json = await res.json();
      return json.data || json;
    },
    enabled: !isNew && !!adminKey && !!id,
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (fetchedPlaylistDetail) {
      const data = fetchedPlaylistDetail;
      const rawTracks = Array.isArray(data.tracks) ? data.tracks : [];
      const normalizedTracks = rawTracks.map((t, idx) => ({
        id: t.id || `track-${idx}`,
        custom_title: t.custom_title || t.title || '',
        custom_artist: t.custom_artist || t.artist || '',
        youtube_video_id: t.youtube_video_id || t.youtubeId || '',
        thumbnail: t.thumbnail || t.cover || t.cover_url || '',
        is_confirmed: true,
      }));

      setFormData({
        title: data.title || '',
        subtitle: data.subtitle || '',
        category: data.category || (isUserType ? 'user' : 'theme'),
        category_label: data.category_label || (isUserType ? '유저 공유' : 'sofar'),
        cover: data.cover || data.cover_url || '',
        tags: Array.isArray(data.tags) ? data.tags.join(', ') : data.tags || data.tag || '',
        author: data.author || (data.user_id ? `유저 (${data.user_id.substring(0, 8)})` : '공유 사용자'),
        is_active: data.is_active !== undefined ? data.is_active : (data.is_public !== undefined ? data.is_public : true),
        tracks: normalizedTracks,
      });
    }
  }, [fetchedPlaylistDetail, isUserType]);

  useEffect(() => {
    if (detailError) {
      setErrorMsg(detailError.message || '플레이리스트 정보를 불러오지 못했습니다.');
    }
  }, [detailError]);

  // ── TanStack Query: 인기 음원 차트 Top 50 ──
  const { data: popularTracksData, isLoading: isPopularLoading } = useQuery({
    queryKey: ['popularTracks'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/chart/popular?limit=50`);
      const json = await res.json();
      return json && json.success && Array.isArray(json.data) ? json.data : [];
    },
    enabled: isPickerModalOpen && pickerTab === 'popular',
    staleTime: 1000 * 60 * 10,
  });

  const popularTracks = popularTracksData || [];

  // ── TanStack Query: 기존 큐레이션 플레이리스트 목록 ──
  const { data: existingPlaylistsData } = useQuery({
    queryKey: ['adminPlaylists', adminKey],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/admin/playlists`, {
        headers: { 'x-admin-key': adminKey || '' },
      });
      if (!res.ok) return [];
      const json = await res.json();
      const items = json.data || json;
      return Array.isArray(items) ? items : [];
    },
    enabled: isPickerModalOpen && pickerTab === 'playlists' && !!adminKey,
    staleTime: 1000 * 60 * 5,
  });

  const existingPlaylists = existingPlaylistsData || [];

  // ── TanStack Query: 음원 검색 결과 ──
  const { data: searchResultsData, isLoading: isSearchLoading } = useQuery({
    queryKey: ['trackSearch', searchQuery],
    queryFn: async () => {
      if (!searchQuery.trim() || searchQuery.trim().length < 2) return [];
      let res = await fetch(`${API_BASE}/api/chart/search-itunes?q=${encodeURIComponent(searchQuery.trim())}`);
      let json = await res.json();
      if (json && json.success && Array.isArray(json.data) && json.data.length > 0) {
        return json.data.slice(0, 8);
      }
      res = await fetch(`${API_BASE}/api/chart/search-youtube?q=${encodeURIComponent(searchQuery.trim())}`);
      json = await res.json();
      if (json && json.success && Array.isArray(json.data)) {
        return json.data.slice(0, 8);
      }
      return [];
    },
    enabled: searchQuery.trim().length >= 2,
    staleTime: 1000 * 60,
  });

  const searchResults = searchResultsData || [];

  // iTunes 정식 1:1 앨범 커버 아트 & 메타데이터 자동 매칭 헬퍼
  const autoMatchItunesMetadata = async (title, artist) => {
    if (!title || !title.trim()) return null;
    try {
      const q = `${title.trim()} ${artist ? artist.trim() : ''}`.trim();
      const res = await fetch(`${API_BASE}/api/chart/search-itunes?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (json && json.success && Array.isArray(json.data) && json.data.length > 0) {
        return json.data[0];
      }
    } catch (e) {
      console.error('Auto match iTunes metadata error:', e);
    }
    return null;
  };

  // 유튜브 비디오 ID 자동 매칭 헬퍼 (수동 매칭 DB 우선 확인 후 검색)
  const autoMatchYoutubeVideoId = async (title, artist, trackId = null) => {
    if (!title || !title.trim()) return null;
    try {
      const q = `${title.trim()} ${artist ? artist.trim() : ''}`.trim();

      // 1) 수동 매칭 DB 확인
      const trackIdParam = trackId ? `&trackId=${encodeURIComponent(trackId)}` : '';
      try {
        const mapRes = await fetch(`${API_BASE}/api/chart/song-mapping?query=${encodeURIComponent(q)}${trackIdParam}`);
        if (mapRes.ok) {
          const mapJson = await mapRes.json();
          if (mapJson && mapJson.success && mapJson.data?.youtube_video_id) {
            return mapJson.data.youtube_video_id;
          }
        }
      } catch (_) {}

      // 2) 유튜브 검색 API 확인
      const res = await fetch(`${API_BASE}/api/chart/search-youtube?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (json && json.success && Array.isArray(json.data) && json.data.length > 0) {
        return json.data[0].youtube_video_id || null;
      }
    } catch (e) {
      console.error('Auto match youtube error:', e);
    }
    return null;
  };

  // 외부 클릭 시 검색 결과 팝업 닫기
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('.autocomplete-dropdown-overlay') && !e.target.closest('.track-search-input')) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 수록곡 중복 검증 헬퍼
  const checkIsDuplicateTrack = (cand, tracksList = formData.tracks) => {
    if (!cand) return false;
    const norm = (str) => (str || '').toLowerCase().replace(/[\s\(\)\[\]\-_]/g, '').trim();

    const candVid = (cand.youtube_video_id || cand.youtubeId || '').trim();
    const candTitle = norm(cand.custom_title || cand.title);
    const candArtist = norm(cand.custom_artist || cand.artist);

    return tracksList.some((existing) => {
      const exVid = (existing.youtube_video_id || existing.youtubeId || '').trim();
      if (candVid && exVid && candVid === exVid) {
        return true;
      }
      const exTitle = norm(existing.custom_title || existing.title);
      const exArtist = norm(existing.custom_artist || existing.artist);

      if (candTitle && exTitle && candTitle === exTitle) {
        if (!candArtist || !exArtist || candArtist === exArtist) {
          return true;
        }
      }
      return false;
    });
  };

  // 외부 커스텀 이벤트 (사이드바 1-Click 추가)
  useEffect(() => {
    const handleAddTrackEvent = async (e) => {
      if (e && e.detail) {
        const { custom_title, custom_artist, youtube_video_id } = e.detail;
        let vid = youtube_video_id || '';
        let itunesData = null;
        if (custom_title) {
          itunesData = await autoMatchItunesMetadata(custom_title, custom_artist);
          if (!vid) vid = await autoMatchYoutubeVideoId(custom_title, custom_artist);
        }
        const newTrack = {
          id: `track-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          custom_title: custom_title || itunesData?.custom_title || '무제',
          custom_artist: custom_artist || itunesData?.custom_artist || '알 수 없음',
          thumbnail: itunesData?.thumbnail || e.detail.thumbnail || '',
          youtube_video_id: vid || '',
          is_confirmed: true,
        };

        if (checkIsDuplicateTrack(newTrack, formData.tracks)) {
          showWarningToast(`'${newTrack.custom_title}' 곡은 이미 큐레이션 수록곡 목록에 추가되어 있습니다.`, '중복 곡 추가 방지');
          return;
        }

        setFormData((prev) => ({
          ...prev,
          tracks: [...prev.tracks, newTrack],
        }));
      }
    };
    window.addEventListener('sofar-add-track', handleAddTrackEvent);
    return () => window.removeEventListener('sofar-add-track', handleAddTrackEvent);
  }, [formData.tracks, showWarningToast]);

  // 검색 항목 추가
  const handleAddSearchTrack = async (item) => {
    // 팝업 즉시 닫기 및 검색어 초기화 (광클 중복 방지)
    setIsSearchOpen(false);
    setSearchQuery('');

    const title = item.custom_title || item.title || '';
    const artist = item.custom_artist || item.artist || '';

    let vid = item.youtube_video_id || '';
    let thumbnail = item.thumbnail || item.cover || '';

    if (!thumbnail || !vid) {
      const itunesData = await autoMatchItunesMetadata(title, artist);
      if (itunesData) {
        if (!thumbnail) thumbnail = itunesData.thumbnail || '';
      }
      if (!vid) {
        vid = await autoMatchYoutubeVideoId(title, artist);
      }
    }

    const newTrack = {
      id: `track-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      custom_title: title || '무제',
      custom_artist: artist || '알 수 없음',
      youtube_video_id: vid || '',
      thumbnail: thumbnail || '',
      is_confirmed: true,
    };

    if (checkIsDuplicateTrack(newTrack, formData.tracks)) {
      showWarningToast(`'${newTrack.custom_title}' 곡은 이미 큐레이션 수록곡 목록에 추가되어 있습니다.`, '중복 곡 추가 방지');
      return;
    }

    setFormData((prev) => ({
      ...prev,
      tracks: [...prev.tracks, newTrack],
    }));
  };

  // 검색 엔터 제출
  const handleSearchSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    const clean = searchQuery.trim().replace(/^\d+[\.\)\-]\s*/, '');
    let title = clean;
    let artist = '';
    if (clean.includes(' - ')) {
      const parts = clean.split(' - ');
      title = parts[0].trim();
      artist = parts.slice(1).join(' - ').trim();
    } else if (clean.includes('(') && clean.includes(')')) {
      const match = clean.match(/^(.*?)\((.*?)\)$/);
      if (match) {
        title = match[1].trim();
        artist = match[2].trim();
      }
    }

    const itunesData = await autoMatchItunesMetadata(title, artist);
    const vid = await autoMatchYoutubeVideoId(title, artist);

    const newTrack = {
      id: `track-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      custom_title: itunesData?.custom_title || title || '무제',
      custom_artist: itunesData?.custom_artist || artist || '알 수 없음',
      thumbnail: itunesData?.thumbnail || '',
      youtube_video_id: vid || '',
      is_confirmed: true,
    };

    if (checkIsDuplicateTrack(newTrack, formData.tracks)) {
      showWarningToast(`'${newTrack.custom_title}' 곡은 이미 큐레이션 수록곡 목록에 추가되어 있습니다.`, '중복 곡 추가 방지');
      setSearchQuery('');
      setIsSearchOpen(false);
      return;
    }

    setFormData((prev) => ({
      ...prev,
      tracks: [...prev.tracks, newTrack],
    }));

    setSearchQuery('');
    setIsSearchOpen(false);
  };

  // 폼 필드 변경
  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // 개별 트랙 필드 변경
  const handleTrackChange = (index, field, value) => {
    setFormData((prev) => {
      const updatedTracks = [...prev.tracks];
      updatedTracks[index] = { ...updatedTracks[index], [field]: value };
      return { ...prev, tracks: updatedTracks };
    });
  };

  // 트랙 추가 및 삭제
  const handleAddTrack = () => {
    setFormData((prev) => ({
      ...prev,
      tracks: [
        ...prev.tracks,
        { id: Date.now(), custom_title: '', custom_artist: '', youtube_video_id: '', is_confirmed: false },
      ],
    }));
  };

  const handleRemoveTrack = (index) => {
    setFormData((prev) => ({
      ...prev,
      tracks: prev.tracks.filter((_, i) => i !== index),
    }));
  };

  const handleMoveTrack = (index, direction) => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= formData.tracks.length) return;
    setFormData((prev) => {
      const updatedTracks = [...prev.tracks];
      const temp = updatedTracks[index];
      updatedTracks[index] = updatedTracks[targetIndex];
      updatedTracks[targetIndex] = temp;
      return { ...prev, tracks: updatedTracks };
    });
  };

  // 텍스트 파싱 헬퍼
  const parsePastedTracks = (text) => {
    if (!text || !text.trim()) return [];
    const lines = text.split('\n');
    const parsed = [];
    lines.forEach((line) => {
      const clean = line.trim();
      if (!clean) return;
      let title = clean;
      let artist = '';
      let cleanLine = clean.replace(/^\d+[\.\)\-]\s*/, '').trim();
      if (cleanLine.includes(' - ')) {
        const parts = cleanLine.split(' - ');
        title = parts[0].trim();
        artist = parts.slice(1).join(' - ').trim();
      } else if (cleanLine.includes('\t')) {
        const parts = cleanLine.split('\t').filter(Boolean);
        if (parts.length >= 2) {
          title = parts[0].trim();
          artist = parts[1].trim();
        }
      } else if (cleanLine.includes('(') && cleanLine.includes(')')) {
        const match = cleanLine.match(/^(.*?)\((.*?)\)$/);
        if (match) {
          title = match[1].trim();
          artist = match[2].trim();
        }
      }
      if (title) {
        parsed.push({
          id: Date.now() + Math.random(),
          custom_title: title,
          custom_artist: artist || '알 수 없음',
          youtube_video_id: '',
        });
      }
    });
    return parsed;
  };

  // 텍스트 일괄 붙여넣기 적용
  const handleApplyPaste = async () => {
    const parsed = parsePastedTracks(pasteText);
    if (parsed.length === 0) return;

    setIsPasteModalOpen(false);
    setPasteText('');

    if (pasteMode === 'replace') {
      setFormData((prev) => ({ ...prev, tracks: parsed }));
    } else {
      setFormData((prev) => ({ ...prev, tracks: [...prev.tracks, ...parsed] }));
    }

    const enriched = await Promise.all(
      parsed.map(async (t) => {
        if (t.custom_title) {
          const itunesData = await autoMatchItunesMetadata(t.custom_title, t.custom_artist);
          const vid = t.youtube_video_id || (await autoMatchYoutubeVideoId(t.custom_title, t.custom_artist));
          return {
            ...t,
            custom_title: itunesData?.custom_title || t.custom_title,
            custom_artist: itunesData?.custom_artist || t.custom_artist,
            thumbnail: itunesData?.thumbnail || t.thumbnail || '',
            youtube_video_id: vid || '',
          };
        }
        return t;
      })
    );

    setFormData((prev) => {
      if (pasteMode === 'replace') {
        return { ...prev, tracks: enriched };
      }
      const existingCount = prev.tracks.length - parsed.length;
      const updated = [...prev.tracks];
      enriched.forEach((item, i) => {
        if (updated[existingCount + i]) {
          updated[existingCount + i] = item;
        }
      });
      return { ...prev, tracks: updated };
    });
  };

  // 링크 파싱 헬퍼
  const extractYoutubeVideoIds = (text) => {
    if (!text) return [];
    const regex = /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/g;
    const matches = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (match[1] && !matches.includes(match[1])) {
        matches.push(match[1]);
      }
    }
    const lines = text.split('\n');
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed) && !matches.includes(trimmed)) {
        matches.push(trimmed);
      }
    });
    return matches;
  };

  // 링크 일괄 추출 적용
  const handleApplyLinkImport = async () => {
    const videoIds = extractYoutubeVideoIds(linkImportText);
    if (videoIds.length === 0) {
      alert('올바른 유튜브 영상 URL이나 비디오 ID를 찾을 수 없습니다.');
      return;
    }

    setIsImportingLinks(true);
    try {
      const newTracks = [];
      for (const vid of videoIds) {
        try {
          const res = await fetch(`${API_BASE}/api/chart/search-youtube?q=${encodeURIComponent(vid)}`);
          const json = await res.json();
          if (json && json.success && Array.isArray(json.data) && json.data.length > 0) {
            const yt = json.data[0];
            newTracks.push({
              id: `track-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              custom_title: yt.custom_title || '유튜브 음원',
              custom_artist: yt.custom_artist || 'YouTube',
              youtube_video_id: vid,
            });
          } else {
            newTracks.push({
              id: `track-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              custom_title: '유튜브 음원',
              custom_artist: 'YouTube',
              youtube_video_id: vid,
            });
          }
        } catch (e) {
          newTracks.push({
            id: `track-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            custom_title: '유튜브 음원',
            custom_artist: 'YouTube',
            youtube_video_id: vid,
          });
        }
      }

      const uniqueNewTracks = newTracks.filter((t, idx, self) => {
        const isSelfDuplicate = self.findIndex((item) => (
          (item.youtube_video_id && item.youtube_video_id === t.youtube_video_id) ||
          (item.custom_title === t.custom_title && item.custom_artist === t.custom_artist)
        )) !== idx;
        if (isSelfDuplicate) return false;
        return !checkIsDuplicateTrack(t, formData.tracks);
      });

      if (uniqueNewTracks.length < newTracks.length) {
        const skippedCount = newTracks.length - uniqueNewTracks.length;
        showInfoToast(`총 ${newTracks.length}곡 중 중복된 ${skippedCount}곡을 제외하고 ${uniqueNewTracks.length}곡이 추가되었습니다.`, '목록 추출 안내');
      }

      setFormData((prev) => ({
        ...prev,
        tracks: [...prev.tracks, ...uniqueNewTracks],
      }));
      setIsLinkImportModalOpen(false);
      setLinkImportText('');
    } catch (err) {
      console.error('Link import error:', err);
      showErrorToast('링크 추출 중 오류가 발생했습니다.', '오류');
    } finally {
      setIsImportingLinks(false);
    }
  };

  // 피커 모달 헬퍼
  const handleSelectPlaylistToView = (playlistId) => {
    setSelectedPlaylistId(playlistId);
    if (!playlistId) {
      setSelectedPlaylistTracks([]);
      return;
    }
    const target = existingPlaylists.find((p) => String(p.id) === String(playlistId));
    if (target && Array.isArray(target.tracks)) {
      setSelectedPlaylistTracks(target.tracks);
    } else {
      setSelectedPlaylistTracks([]);
    }
  };

  const toggleCheckPickerTrack = (trackKey) => {
    setCheckedPickerTracks((prev) => {
      const next = new Set(prev);
      if (next.has(trackKey)) {
        next.delete(trackKey);
      } else {
        next.add(trackKey);
      }
      return next;
    });
  };

  const toggleAllPickerTracks = (tracksList) => {
    setCheckedPickerTracks((prev) => {
      const next = new Set(prev);
      const allKeys = tracksList.map((t, idx) => `${t.title || t.custom_title}-${t.artist || t.custom_artist}-${idx}`);
      const isAllChecked = allKeys.every((k) => next.has(k));
      if (isAllChecked) {
        allKeys.forEach((k) => next.delete(k));
      } else {
        allKeys.forEach((k) => next.add(k));
      }
      return next;
    });
  };

  const handleApplyPickerSelection = async () => {
    const listToSearch = pickerTab === 'popular' ? popularTracks : selectedPlaylistTracks;
    const selectedItems = [];
    listToSearch.forEach((t, idx) => {
      const key = `${t.title || t.custom_title}-${t.artist || t.custom_artist}-${idx}`;
      if (checkedPickerTracks.has(key)) {
        selectedItems.push(t);
      }
    });

    setIsPickerModalOpen(false);
    setCheckedPickerTracks(new Set());

    if (selectedItems.length === 0) return;

    const enrichedTracks = await Promise.all(
      selectedItems.map(async (t) => {
        const title = t.custom_title || t.title || '';
        const artist = t.custom_artist || t.artist || '';
        let thumbnail = t.thumbnail || t.cover || t.cover_url || '';
        let vid = t.youtube_video_id || t.youtubeId || '';

        if (!thumbnail || !vid) {
          const itunesData = await autoMatchItunesMetadata(title, artist);
          if (itunesData && !thumbnail) {
            thumbnail = itunesData.thumbnail || '';
          }
          if (!vid) {
            vid = await autoMatchYoutubeVideoId(title, artist);
          }
        }

        return {
          id: `track-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          custom_title: title || '무제',
          custom_artist: artist || '알 수 없음',
          youtube_video_id: vid || '',
          thumbnail: thumbnail || '',
          is_confirmed: true,
        };
      })
    );

    setFormData((prev) => ({
      ...prev,
      tracks: [...prev.tracks, ...enrichedTracks],
    }));
  };

  // 드래그 앤 드롭 헬퍼
  const handleTrackDragOver = (e, idx) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = draggingTrackIndexRef.current !== null ? 'move' : 'copy';

    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const insertIdx = e.clientY < midY ? idx : idx + 1;
    dropTargetIndexRef.current = insertIdx;
    setDropTargetIndex(insertIdx);
    if (!isDragOverDropZone) setIsDragOverDropZone(true);
  };

  const handleDropTrack = async (e, targetIdx = null) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverDropZone(false);

    const insertIdx = targetIdx !== null ? targetIdx : (dropTargetIndexRef.current !== null ? dropTargetIndexRef.current : dropTargetIndex);
    dropTargetIndexRef.current = null;
    setDropTargetIndex(null);

    const fromIdx = draggingTrackIndexRef.current;
    draggingTrackIndexRef.current = null;
    setDraggingTrackIndex(null);

    // 1) 순서 변경 (Ref 기반 - 같은 플레이리스트 내부 재정렬)
    if (typeof fromIdx === 'number' && fromIdx >= 0) {
      setFormData((prev) => {
        const updated = [...prev.tracks];
        if (fromIdx < 0 || fromIdx >= updated.length) return prev;
        const [movedItem] = updated.splice(fromIdx, 1);
        let finalIdx = insertIdx !== null ? insertIdx : updated.length;
        if (insertIdx > fromIdx) {
          finalIdx = insertIdx - 1;
        }
        if (finalIdx < 0) finalIdx = 0;
        if (finalIdx > updated.length) finalIdx = updated.length;
        updated.splice(finalIdx, 0, movedItem);
        return { ...prev, tracks: updated };
      });
      return;
    }

    try {
      const jsonStr = e.dataTransfer?.getData('application/json') || e.dataTransfer?.getData('text/plain');
      if (jsonStr) {
        let data = null;
        try {
          data = JSON.parse(jsonStr);
        } catch (_) {}

        if (data && data.type === 'reorder-track' && typeof data.fromIndex === 'number') {
          const from = data.fromIndex;
          setFormData((prev) => {
            const updated = [...prev.tracks];
            if (from < 0 || from >= updated.length) return prev;
            const [movedItem] = updated.splice(from, 1);
            let finalIdx = insertIdx !== null ? insertIdx : updated.length;
            if (insertIdx > from) {
              finalIdx = insertIdx - 1;
            }
            if (finalIdx < 0) finalIdx = 0;
            if (finalIdx > updated.length) finalIdx = updated.length;
            updated.splice(finalIdx, 0, movedItem);
            return { ...prev, tracks: updated };
          });
          return;
        }

        if (data && (data.custom_title || data.youtube_video_id || data.title)) {
          const title = data.custom_title || data.title || '';
          const artist = data.custom_artist || data.artist || '';
          let vid = data.youtube_video_id || data.youtubeId || '';
          let thumbnail = data.thumbnail || data.artwork || data.cover || data.cover_url || '';
          const trackKeyId = data.id || data.trackId || null;

          const trackId = `track-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          const initialTrack = {
            id: trackId,
            custom_title: title || '무제',
            custom_artist: artist || '알 수 없음',
            youtube_video_id: vid || '',
            thumbnail: thumbnail || '',
            is_confirmed: true,
          };

          if (checkIsDuplicateTrack(initialTrack, formData.tracks)) {
            showWarningToast(`'${initialTrack.custom_title}' 곡은 이미 큐레이션 수록곡 목록에 추가되어 있습니다.`, '중복 곡 추가 방지');
            return;
          }

          // 즉시 수록곡 목록에 삽입하여 빠른 반응성 제공
          setFormData((prev) => {
            const updated = [...prev.tracks];
            if (insertIdx !== null && insertIdx >= 0 && insertIdx <= updated.length) {
              updated.splice(insertIdx, 0, initialTrack);
            } else {
              updated.push(initialTrack);
            }
            return { ...prev, tracks: updated };
          });

          // 유튜브 비디오 ID 또는 앨범 커버가 없는 경우 자동 매칭 수행
          if (!vid || !thumbnail) {
            try {
              let enrichedThumb = thumbnail;
              let enrichedVid = vid;
              const itunesData = await autoMatchItunesMetadata(title, artist);
              if (itunesData && !enrichedThumb) {
                enrichedThumb = itunesData.thumbnail || '';
              }
              if (!enrichedVid) {
                enrichedVid = await autoMatchYoutubeVideoId(title, artist, trackKeyId);
              }
              if (!enrichedThumb && enrichedVid) {
                enrichedThumb = `https://img.youtube.com/vi/${enrichedVid}/hqdefault.jpg`;
              }
              if (enrichedVid || enrichedThumb) {
                setFormData((prev) => ({
                  ...prev,
                  tracks: prev.tracks.map((t) =>
                    t.id === trackId
                      ? {
                          ...t,
                          custom_title: t.custom_title || itunesData?.custom_title || '무제',
                          custom_artist: t.custom_artist || itunesData?.custom_artist || '알 수 없음',
                          youtube_video_id: enrichedVid || t.youtube_video_id,
                          thumbnail: enrichedThumb || t.thumbnail,
                        }
                      : t
                  ),
                }));
              }
            } catch (err) {
              console.warn('Auto match on drop failed:', err);
            }
          }
          return;
        }
      }

      const text = e.dataTransfer?.getData('text/plain');
      if (text) {
        let vid = text.trim();
        if (vid.includes('v=')) vid = vid.split('v=')[1].split('&')[0];
        else if (vid.includes('youtu.be/')) vid = vid.split('youtu.be/')[1].split('?')[0];

        if (vid.length === 11 && !vid.includes(' ')) {
          const trackId = `track-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          const initialTrack = {
            id: trackId,
            custom_title: '유튜브 음원',
            custom_artist: 'YouTube',
            youtube_video_id: vid,
            thumbnail: `https://img.youtube.com/vi/${vid}/hqdefault.jpg`,
            is_confirmed: true,
          };
          if (checkIsDuplicateTrack(initialTrack, formData.tracks)) {
            showWarningToast('이미 큐레이션 수록곡 목록에 추가되어 있습니다.', '중복 곡 추가 방지');
            return;
          }
          setFormData((prev) => {
            const updated = [...prev.tracks];
            if (insertIdx !== null && insertIdx >= 0 && insertIdx <= updated.length) {
              updated.splice(insertIdx, 0, initialTrack);
            } else {
              updated.push(initialTrack);
            }
            return { ...prev, tracks: updated };
          });

          // 유튜브 정보 보강
          try {
            const res = await fetch(`${API_BASE}/api/chart/search-youtube?q=${encodeURIComponent(vid)}`);
            const json = await res.json();
            if (json && json.success && Array.isArray(json.data) && json.data.length > 0) {
              const yt = json.data[0];
              setFormData((prev) => ({
                ...prev,
                tracks: prev.tracks.map((t) =>
                  t.id === trackId
                    ? {
                        ...t,
                        custom_title: yt.custom_title || t.custom_title,
                        custom_artist: yt.custom_artist || t.custom_artist,
                        thumbnail: yt.thumbnail || t.thumbnail,
                      }
                    : t
                ),
              }));
            }
          } catch (err) {
            console.warn('Enrich youtube info failed:', err);
          }
          return;
        } else if (text.includes(' - ')) {
          const parts = text.split(' - ');
          const artist = parts[0].trim();
          const title = parts.slice(1).join(' - ').trim();
          const trackId = `track-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          const initialTrack = {
            id: trackId,
            custom_title: title || '무제',
            custom_artist: artist || '알 수 없음',
            youtube_video_id: '',
            thumbnail: '',
            is_confirmed: true,
          };
          if (checkIsDuplicateTrack(initialTrack, formData.tracks)) {
            showWarningToast(`'${initialTrack.custom_title}' 곡은 이미 큐레이션 수록곡 목록에 추가되어 있습니다.`, '중복 곡 추가 방지');
            return;
          }
          setFormData((prev) => {
            const updated = [...prev.tracks];
            if (insertIdx !== null && insertIdx >= 0 && insertIdx <= updated.length) {
              updated.splice(insertIdx, 0, initialTrack);
            } else {
              updated.push(initialTrack);
            }
            return { ...prev, tracks: updated };
          });

          // 자동 메타데이터 & 유튜브 매칭
          try {
            const itunesData = await autoMatchItunesMetadata(title, artist);
            const matchedVid = await autoMatchYoutubeVideoId(title, artist);
            const thumb = itunesData?.thumbnail || (matchedVid ? `https://img.youtube.com/vi/${matchedVid}/hqdefault.jpg` : '');
            setFormData((prev) => ({
              ...prev,
              tracks: prev.tracks.map((t) =>
                t.id === trackId
                  ? {
                      ...t,
                      custom_title: t.custom_title || itunesData?.custom_title || '무제',
                      custom_artist: t.custom_artist || itunesData?.custom_artist || '알 수 없음',
                      thumbnail: thumb || t.thumbnail,
                      youtube_video_id: matchedVid || t.youtube_video_id,
                    }
                  : t
              ),
            }));
          } catch (err) {
            console.warn('Enrich track metadata failed:', err);
          }
          return;
        }
      }
    } catch (err) {
      console.warn('Track drop error:', err);
    }
  };

  // 플레이리스트 최종 제출 및 저장
  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();

    if (isSystem) {
      showWarningToast('시스템 기본 장르 큐레이션은 실시간 차트와 연동되어 직접 수정할 수 없습니다.', '시스템 고정');
      return;
    }

    if (!formData.title.trim()) {
      alert('플레이리스트 제목을 입력해주세요.');
      return;
    }
    setIsSaving(true);

    const validTracks = formData.tracks.filter(
      (t) => (t.custom_title && t.custom_title.trim()) || (t.custom_artist && t.custom_artist.trim())
    );

    if (formData.tracks.length > 0 && validTracks.length === 0) {
      alert('입력된 수록곡 정보가 없습니다. 곡명이나 가수를 입력하거나 빈 항목을 삭제해주세요.');
      setIsSaving(false);
      return;
    }

    try {
      const url = isUserType
        ? `${API_BASE}/api/admin/user-playlists/${id}`
        : (isNew ? `${API_BASE}/api/admin/playlists` : `${API_BASE}/api/admin/playlists/${id}`);
      const method = isNew ? 'POST' : 'PATCH';

      const tagsString = typeof formData.tags === 'string'
        ? formData.tags.trim()
        : (Array.isArray(formData.tags) ? formData.tags.join(', ') : '');

      const payload = isUserType
        ? { title: formData.title, cover_url: formData.cover, is_public: formData.is_active, tracks: validTracks }
        : {
            title: formData.title,
            subtitle: formData.subtitle || '',
            category: formData.category || 'theme',
            category_label: formData.category_label || 'sofar',
            cover: formData.cover || '',
            tag: tagsString,
            author: formData.author || 'sofar',
            is_active: formData.is_active,
            tracks: validTracks,
          };

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey,
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || (json && json.success === false)) {
        throw new Error(json?.message || '저장 중 오류가 발생했습니다.');
      }

      // 1) 캐시 무효화 (상세 및 목록)
      queryClient.invalidateQueries({ queryKey: ['playlistDetail'] });
      queryClient.invalidateQueries({ queryKey: ['adminPlaylists'] });
      queryClient.invalidateQueries({ queryKey: ['popularTracks'] });

      // 2) 전역 목록 및 대시보드 상태 즉시 갱신
      if (adminKey) {
        try {
          await Promise.all([
            fetchPlaylists(adminKey),
            fetchUserPlaylists(adminKey),
            fetchDashboardInsights(adminKey),
          ]);
        } catch (_) {}
      }

      showSuccessToast(isNew ? '새 큐레이션이 성공적으로 생성되었습니다!' : '큐레이션 수정이 완료되었습니다!', '저장 성공');
      navigate(isUserType ? '/curations?category=user_shared' : '/curations');
    } catch (err) {
      console.error('Save failed:', err);
      showErrorToast(err.message || '서버 연결 실패', '저장 실패');
    } finally {
      setIsSaving(false);
    }
  };

  const parsedPastedTracks = parsePastedTracks(pasteText);

  const value = {
    isRightSidebarOpen,
    navigate,
    id,
    isUserType,
    isReadonly,
    isSystem,
    isNew,
    adminKey,
    isLoading: isDetailLoading,
    isSaving,
    errorMsg,
    formData,
    // Form actions
    handleChange,
    handleTrackChange,
    handleAddTrack,
    handleRemoveTrack,
    handleMoveTrack,
    handleSubmit,
    // Paste modal
    isPasteModalOpen,
    setIsPasteModalOpen,
    pasteText,
    setPasteText,
    pasteMode,
    setPasteMode,
    parsedPastedTracks,
    handleApplyPaste,
    // Link import modal
    isLinkImportModalOpen,
    setIsLinkImportModalOpen,
    linkImportText,
    setLinkImportText,
    isImportingLinks,
    handleApplyLinkImport,
    // Picker modal
    isPickerModalOpen,
    setIsPickerModalOpen,
    pickerTab,
    setPickerTab,
    isPopularLoading,
    popularTracks,
    existingPlaylists,
    selectedPlaylistId,
    selectedPlaylistTracks,
    checkedPickerTracks,
    setCheckedPickerTracks,
    handleSelectPlaylistToView,
    toggleCheckPickerTrack,
    toggleAllPickerTracks,
    handleApplyPickerSelection,
    // Track detail modal
    selectedTrackDetail,
    setSelectedTrackDetail,
    // Search
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearchLoading,
    isSearchOpen,
    setIsSearchOpen,
    handleAddSearchTrack,
    handleSearchSubmit,
    // Drag and drop
    isDragOverDropZone,
    setIsDragOverDropZone,
    dropTargetIndex,
    setDropTargetIndex,
    draggingTrackIndex,
    setDraggingTrackIndex: setDraggingTrackIndexWithRef,
    handleTrackDragOver,
    handleDropTrack,
  };

  return (
    <PlaylistEditorContext.Provider value={value}>
      {children}
    </PlaylistEditorContext.Provider>
  );
}

export function usePlaylistEditor() {
  const ctx = useContext(PlaylistEditorContext);
  if (!ctx) {
    throw new Error('usePlaylistEditor must be used within a PlaylistEditorProvider');
  }
  return ctx;
}
