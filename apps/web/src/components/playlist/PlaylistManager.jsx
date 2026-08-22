import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAudio } from '../../contexts/AudioContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../contexts/AuthContext';
import { Trash2, Plus, ChevronLeft, Music, MoreVertical, Pencil, ListPlus, ListMusic, Search, Home, Headphones, Share2, Play, Shuffle, TvMinimal, LayoutGrid } from 'lucide-react';

import { useQueryClient } from '@tanstack/react-query';

// 새로 추출한 서브 컴포넌트 & 유틸 임포트
import TrackRowItem from './TrackRowItem';
import QueueRowItem from './QueueRowItem';
import TrackThumbnail from './TrackThumbnail';
import { extractMetadataWithLocalLLM, cleanYoutubeMetadata, searchYoutube } from '../../utils/youtube';
import { durationCache } from '../../utils/durationCache';
import { Button, Logo, Dropdown } from '../ui';
import './PlaylistManager.css';

// TanStack Query Hooks
import { 
  usePlaylistsQuery, 
  usePlaylistPreviewsQuery, 
  useCreatePlaylistMutation, 
  useUpdatePlaylistMutation, 
  useDeletePlaylistMutation 
} from '../../hooks/usePlaylists';
import { 
  usePlaylistTracksQuery, 
  useAddTrackMutation,
  useDeleteTrackMutation 
} from '../../hooks/useTracks';
import PlaylistModal from './PlaylistModal';
import { getStaggerStyle } from '../../utils/animation';

export default function PlaylistManager() {
  const { user } = useAuth();
  const { 
    playlist, setPlaylist, 
    queue, setQueue, 
    currentTrack, playTrack, 
    isPlaying, togglePlay, showToast,
    isShuffle, setIsShuffle,
    isShuffleFor, toggleShuffleFor,
    activeSharedPlaylist, setActiveSharedPlaylist,
    playingSource, setPlayingSource,
    showVideoInVinyl, isLyricsExpanded, triggerReturnToVinyl
  } = useAudio();

  const navigate = useNavigate();
  const location = useLocation();
  const isNowPlayingPage = location.pathname === '/now' || location.pathname === '/now-playing';
  const displayInVinyl = showVideoInVinyl && !isLyricsExpanded && isNowPlayingPage;

  // TanStack Queries & Mutations
  const queryClient = useQueryClient();
  const { data: playlists = [], isLoading: isPlaylistsLoading } = usePlaylistsQuery();
  const { data: playlistPreviews = {} } = usePlaylistPreviewsQuery();

  useEffect(() => {
    const handleTracksUpdated = () => {
      queryClient.invalidateQueries({ queryKey: ['tracks'] });
      queryClient.invalidateQueries({ queryKey: ['playlist-previews'] });
    };
    const handlePlaylistsUpdated = () => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      queryClient.invalidateQueries({ queryKey: ['playlist-previews'] });
    };
    window.addEventListener('tracks-updated', handleTracksUpdated);
    window.addEventListener('playlists-updated', handlePlaylistsUpdated);
    return () => {
      window.removeEventListener('tracks-updated', handleTracksUpdated);
      window.removeEventListener('playlists-updated', handlePlaylistsUpdated);
    };
  }, [queryClient]);

  const [selectedPlaylistId, setSelectedPlaylistId] = useState(null);
  const { 
    data: fetchedTracks = [], 
    isLoading: isTracksLoading, 
    isFetching: isTracksFetching 
  } = usePlaylistTracksQuery(selectedPlaylistId);

  const createPlaylistMutation = useCreatePlaylistMutation();
  const updatePlaylistMutation = useUpdatePlaylistMutation();
  const deletePlaylistMutation = useDeletePlaylistMutation();
  const addTrackMutation = useAddTrackMutation();
  const deleteTrackMutation = useDeleteTrackMutation();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('playlists');

  // 플레이리스트 수정 관련 상태
  const [editingPlaylist, setEditingPlaylist] = useState(null);

  // 드래그앤드랍 위치 표시 및 이동 상태
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverInfo, setDragOverInfo] = useState(null);

  // 플레이리스트 폴더 화면 전환 애니메이션 상태
  const [enteringFolderId, setEnteringFolderId] = useState(null);
  const [isEnteringDetail, setIsEnteringDetail] = useState(false);
  const [isExitingDetail, setIsExitingDetail] = useState(false);
  const [isEnteringFromDetail, setIsEnteringFromDetail] = useState(false);

  // ── 사이드바 뷰 히스토리 스택 (Navigation History Stack) ──
  const sidebarHistoryRef = useRef([]);
  const isNavigatingBackRef = useRef(false);
  const prevViewStateRef = useRef({
    activeTab: 'playlists',
    selectedPlaylistId: null,
    activeSharedPlaylist: null,
    activeSharedPlaylistId: null,
  });

  // 뷰 스냅샷 동등 비교 헬퍼 (유효 플레이리스트 ID 기반 비교, _openedAt 무시)
  const isSameView = (a, b) => {
    if (!a || !b) return false;
    const aEffectiveId = a.selectedPlaylistId || a.activeSharedPlaylist?.id || null;
    const bEffectiveId = b.selectedPlaylistId || b.activeSharedPlaylist?.id || null;
    return (
      a.activeTab === b.activeTab &&
      String(aEffectiveId || '') === String(bEffectiveId || '')
    );
  };

  useEffect(() => {
    const currentSharedId = activeSharedPlaylist ? activeSharedPlaylist.id : null;
    const prevSharedId = prevViewStateRef.current.activeSharedPlaylistId;

    // id 기준으로 변경 여부 판단 (_openedAt 타임스탬프는 무시)
    const isStateChanged =
      prevViewStateRef.current.activeTab !== activeTab ||
      prevViewStateRef.current.selectedPlaylistId !== selectedPlaylistId ||
      prevSharedId !== currentSharedId;

    if (isStateChanged) {
      if (isNavigatingBackRef.current) {
        isNavigatingBackRef.current = false;
      } else {
        const prevSnapshot = {
          activeTab: prevViewStateRef.current.activeTab,
          selectedPlaylistId: prevViewStateRef.current.selectedPlaylistId,
          activeSharedPlaylist: prevViewStateRef.current.activeSharedPlaylist,
        };

        const currentSnapshot = {
          activeTab,
          selectedPlaylistId,
          activeSharedPlaylist,
        };

        // 이전 뷰가 현재 목적지와 동일하면 스택에 추가하지 않음
        if (!isSameView(prevSnapshot, currentSnapshot)) {
          // 스택에서 현재 목적지와 동일한 항목 제거 (목적지 중복 방지)
          // 예: A→B→A 에서 세 번째 A 클릭 시, 스택의 기존 A를 제거한 뒤 B를 push
          sidebarHistoryRef.current = sidebarHistoryRef.current.filter(
            item => !isSameView(item, currentSnapshot)
          );
          sidebarHistoryRef.current.push(prevSnapshot);
          if (sidebarHistoryRef.current.length > 20) sidebarHistoryRef.current.shift();
        }
      }

      prevViewStateRef.current = {
        activeTab,
        selectedPlaylistId,
        activeSharedPlaylist,
        activeSharedPlaylistId: currentSharedId,
      };
    }
  }, [activeTab, selectedPlaylistId, activeSharedPlaylist]);

  // 사이드바 히스토리 뒤로가기 핸들러 (부드러운 전환 및 잔상/플래시 방지)
  const handleSidebarBack = () => {
    if (isExitingDetail) return;

    const stack = sidebarHistoryRef.current;

    // 현재 뷰와 실질적으로 동일한 항목(동일 플레이리스트)이 스택 상단에 남아있다면 제거
    const currentViewSnapshot = {
      activeTab,
      selectedPlaylistId,
      activeSharedPlaylist,
    };
    while (stack.length > 0 && isSameView(stack[stack.length - 1], currentViewSnapshot)) {
      stack.pop();
    }

    // 스택이 비었거나 폴더 그리드(루트)로 복귀
    const targetState = stack.length > 0
      ? stack.pop()
      : { activeTab: 'playlists', selectedPlaylistId: null, activeSharedPlaylist: null };

    const isTargetDetail = !!(targetState.selectedPlaylistId || targetState.activeSharedPlaylist);

    setIsExitingDetail(true);
    setTimeout(() => {
      isNavigatingBackRef.current = true;
      if (setActiveSharedPlaylist) setActiveSharedPlaylist(targetState.activeSharedPlaylist || null);
      setSelectedPlaylistId(targetState.selectedPlaylistId || null);
      setActiveTab(targetState.activeTab || 'playlists');
      setIsExitingDetail(false);

      if (isTargetDetail) {
        setIsEnteringDetail(true);
        setIsTrackListVisible(false);
        setTimeout(() => {
          setIsEnteringDetail(false);
          isNavigatingBackRef.current = false;
        }, 180);
      } else {
        setIsEnteringFromDetail(true);
        setTimeout(() => {
          setIsEnteringFromDetail(false);
          isNavigatingBackRef.current = false;
        }, 180);
      }
    }, 160);
  };

  // 홈 화면 트랙 드래그앤드롭 드롭 타겟 상태 & 핸들러
  const [dragOverFolderId, setDragOverFolderId] = useState(null);
  const [isQueueDragOver, setIsQueueDragOver] = useState(false);
  const [isBackDragOver, setIsBackDragOver] = useState(false);

  // 스프링 로드 폴더/대기열 자동 진입 지연 시간 (0.9초: 바로 드롭할 여유를 충분히 주며 의도적 호버 시 진입)
  const SPRING_LOAD_HOVER_DELAY_MS = 900;
  const dragHoverTimerRef = useRef(null);

  const clearDragHoverTimer = useCallback(() => {
    if (dragHoverTimerRef.current) {
      clearTimeout(dragHoverTimerRef.current);
      dragHoverTimerRef.current = null;
    }
  }, []);

  const handleFolderDragOver = (e, folderId) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    if (dragOverFolderId !== folderId) {
      setDragOverFolderId(folderId);
      clearDragHoverTimer();
      dragHoverTimerRef.current = setTimeout(() => {
        handleSelectPlaylistFolder(folderId);
        clearDragHoverTimer();
      }, SPRING_LOAD_HOVER_DELAY_MS);
    } else if (!dragHoverTimerRef.current && !selectedPlaylistId && !enteringFolderId) {
      dragHoverTimerRef.current = setTimeout(() => {
        handleSelectPlaylistFolder(folderId);
        clearDragHoverTimer();
      }, SPRING_LOAD_HOVER_DELAY_MS);
    }
  };

  const handleFolderDragLeave = (e, folderId) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget && e.currentTarget.contains(e.relatedTarget)) {
      return;
    }
    if (dragOverFolderId === folderId) {
      setDragOverFolderId(null);
      clearDragHoverTimer();
    }
  };

  const handleFolderDrop = async (e, folder) => {
    e.preventDefault();
    e.stopPropagation();
    clearDragHoverTimer();
    setDragOverFolderId(null);
    try {
      const jsonStr = e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain');
      if (!jsonStr) return;
      const track = JSON.parse(jsonStr);
      if (!track || (!track.youtube_video_id && !track.custom_title)) return;

      const videoId = track.youtube_video_id || '';
      const title = track.custom_title || track.title || '제목 없음';
      const artist = track.custom_artist || track.artist || '아티스트 미상';

      await addTrackMutation.mutateAsync({
        playlistId: folder.id,
        videoId,
        title,
        artist,
      });

      showToast(`'${title}' 곡을 '${folder.title}' 플레이리스트에 추가했습니다.`);
    } catch (err) {
      console.warn('Drop to folder failed:', err);
      showToast('플레이리스트 추가 중 오류가 발생했습니다.');
    }
  };

  const handleQueueDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    if (!isQueueDragOver) {
      setIsQueueDragOver(true);
      if (activeTab !== 'queue') {
        clearDragHoverTimer();
        dragHoverTimerRef.current = setTimeout(() => {
          if (setActiveSharedPlaylist) setActiveSharedPlaylist(null);
          setSelectedPlaylistId(null);
          setActiveTab('queue');
          clearDragHoverTimer();
        }, SPRING_LOAD_HOVER_DELAY_MS);
      }
    } else if (!dragHoverTimerRef.current && activeTab !== 'queue') {
      dragHoverTimerRef.current = setTimeout(() => {
        if (setActiveSharedPlaylist) setActiveSharedPlaylist(null);
        setSelectedPlaylistId(null);
        setActiveTab('queue');
        clearDragHoverTimer();
      }, SPRING_LOAD_HOVER_DELAY_MS);
    }
  };

  const handleQueueDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget && e.currentTarget.contains(e.relatedTarget)) {
      return;
    }
    setIsQueueDragOver(false);
    clearDragHoverTimer();
  };

  const handleQueueDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    clearDragHoverTimer();
    setIsQueueDragOver(false);
    setDragOverInfo(null);
    try {
      const jsonStr = e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain');
      if (!jsonStr) return;
      const track = JSON.parse(jsonStr);
      if (!track || (!track.youtube_video_id && !track.custom_title && !track.title)) return;

      addToQueue(track, 'end');
    } catch (err) {
      console.warn('Drop to queue failed:', err);
    }
  };

  const handleBackDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    if (!isBackDragOver) {
      setIsBackDragOver(true);
    }
    if (!dragHoverTimerRef.current) {
      dragHoverTimerRef.current = setTimeout(() => {
        setIsBackDragOver(false);
        clearDragHoverTimer();
        handleSidebarBack();
      }, 550);
    }
  };

  const handleBackDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget && e.currentTarget.contains(e.relatedTarget)) {
      return;
    }
    setIsBackDragOver(false);
    clearDragHoverTimer();
  };

  const handleBackDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    clearDragHoverTimer();
    setIsBackDragOver(false);
    handleSidebarBack();
  };

  const [isDetailDragOver, setIsDetailDragOver] = useState(false);

  const handleDetailDragOver = (e) => {
    if (!selectedPlaylistId || activeSharedPlaylist) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    if (!isDetailDragOver) {
      setIsDetailDragOver(true);
    }
  };

  const handleDetailDragLeave = (e) => {
    if (!selectedPlaylistId || activeSharedPlaylist) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget && e.currentTarget.contains(e.relatedTarget)) {
      return;
    }
    setIsDetailDragOver(false);
  };

  const handleDetailDrop = async (e) => {
    if (!selectedPlaylistId || activeSharedPlaylist) return;
    e.preventDefault();
    e.stopPropagation();
    clearDragHoverTimer();
    setIsDetailDragOver(false);
    try {
      const jsonStr = e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain');
      if (!jsonStr) return;
      const track = JSON.parse(jsonStr);
      if (!track || (!track.youtube_video_id && !track.custom_title)) return;

      const currentPl = playlists.find(p => p.id === selectedPlaylistId);
      const title = track.custom_title || track.title || '제목 없음';
      const artist = track.custom_artist || track.artist || '아티스트 미상';

      await addTrackMutation.mutateAsync({
        playlistId: selectedPlaylistId,
        videoId: track.youtube_video_id || '',
        title,
        artist,
      });

      showToast(`'${title}' 곡을 '${currentPl?.title || '플레이리스트'}'에 추가했습니다.`);
    } catch (err) {
      console.warn('Drop to detail failed:', err);
      showToast('플레이리스트 추가 중 오류가 발생했습니다.');
    }
  };

  const sidebarRef = useRef(null);

  // 모든 드래그 하이라이트 상태 일괄 초기화 함수
  const resetAllDragOverStates = useCallback(() => {
    clearDragHoverTimer();
    setDragOverFolderId(null);
    setIsQueueDragOver(false);
    setIsDetailDragOver(false);
    setIsBackDragOver(false);
    setDragOverInfo(null);
  }, [clearDragHoverTimer]);

  // 전역 dragover/dragend/drop 이벤트 감지: 마우스 좌표가 사이드바 영역 밖이면 즉시 border/하이라이트 초기화
  useEffect(() => {
    const handleGlobalDragOver = (e) => {
      if (sidebarRef.current) {
        const rect = sidebarRef.current.getBoundingClientRect();
        const x = e.clientX;
        const y = e.clientY;
        const isInside = (
          x >= rect.left && 
          x <= rect.right && 
          y >= rect.top && 
          y <= rect.bottom
        );
        
        if (!isInside) {
          resetAllDragOverStates();
        }
      }
    };

    const handleGlobalDragEnd = () => {
      resetAllDragOverStates();
    };

    window.addEventListener('dragover', handleGlobalDragOver);
    window.addEventListener('dragend', handleGlobalDragEnd);
    window.addEventListener('drop', handleGlobalDragEnd);
    return () => {
      window.removeEventListener('dragover', handleGlobalDragOver);
      window.removeEventListener('dragend', handleGlobalDragEnd);
      window.removeEventListener('drop', handleGlobalDragEnd);
    };
  }, [resetAllDragOverStates]);

  // 차트 컨텍스트 트랙 youtube_video_id resolve 상태
  const [resolvedChartTracks, setResolvedChartTracks] = useState(null);
  const resolveAbortRef = useRef(null);

  // ── 사이드바 트랙 목록 가시성 (뷰 전환 시 불투명 프레임 노출 완전 차단 후 스크롤 완료 시 페이드인) ──
  const currentViewKey = `${activeTab}_${selectedPlaylistId || 'null'}_${activeSharedPlaylist?._openedAt || activeSharedPlaylist?.id || 'null'}`;
  const [prevViewKey, setPrevViewKey] = useState(currentViewKey);
  const [isTrackListVisible, setIsTrackListVisible] = useState(true);
  const lastViewSwitchTimeRef = useRef(0);

  // 렌더링 단계에서 뷰 키 변경 즉시 감지 (DOM 페인팅 이전 동기화하여 불투명 첫 프레임 노출 차단)
  if (prevViewKey !== currentViewKey) {
    setPrevViewKey(currentViewKey);
    setIsTrackListVisible(false);
    lastViewSwitchTimeRef.current = Date.now();
  }

  useLayoutEffect(() => {
    if (!isTrackListVisible) {
      const activeEl = document.querySelector('.playlist-sidebar-container .track-row-item.active');
      const currentContainer = document.querySelector('.playlist-sidebar-container .track-item-list');

      // 1) activeEl이 DOM에 정상 렌더링된 경우: 즉시 스크롤 후 페이드인
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' });
        const raf = requestAnimationFrame(() => {
          setIsTrackListVisible(true);
        });
        return () => cancelAnimationFrame(raf);
      }

      // 2) 트랙 데이터가 아직 DOM에 렌더링 중일 수 있으므로 activeEl 렌더링을 대기
      //    최대 150ms까지 대기 후 activeEl 재확인 (없으면 상단 0 정렬 후 페이드인)
      const timeoutTimer = setTimeout(() => {
        const retryActiveEl = document.querySelector('.playlist-sidebar-container .track-row-item.active');
        if (retryActiveEl) {
          retryActiveEl.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' });
        } else if (currentContainer) {
          currentContainer.scrollTop = 0;
        }
        setIsTrackListVisible(true);
      }, 150);

      return () => clearTimeout(timeoutTimer);
    }
  }, [
    isTrackListVisible, 
    currentTrack?.id, 
    currentTrack?.youtube_video_id, 
    fetchedTracks?.length, 
    resolvedChartTracks?.length, 
    activeSharedPlaylist?.id
  ]);

  // 같은 뷰 안에서 재생 트랙이 바뀔 때는 부드러운 스크롤 (뷰 전환 직후 0.8초간은 제외)
  useEffect(() => {
    if (!currentTrack) return;
    const isSwitchRecent = (Date.now() - lastViewSwitchTimeRef.current) < 800;
    if (isSwitchRecent) return;

    const timer = setTimeout(() => {
      const activeEl = document.querySelector('.playlist-sidebar-container .track-row-item.active');
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      }
    }, 60);

    return () => clearTimeout(timer);
  }, [
    currentTrack?.id,
    currentTrack?.youtube_video_id,
    currentTrack?.custom_title,
    fetchedTracks?.length,
    resolvedChartTracks?.length,
  ]);

  // 공유 플레이리스트 열기 이전의 사이드바 상태(선택된 폴더, 탭) 보존 및 내 플레이리스트 탭 전환 + Zoom Enter 애니메이션
  const previousSidebarStateRef = useRef(null);
  const prevSharedPlaylistIdRef = useRef(null);

  // 외부(홈화면 등)에서 공유/차트 플레이리스트 상세 열기 이벤트 수신
  useEffect(() => {
    const handleOpenSharedPlaylist = (e) => {
      const targetPl = e.detail;
      if (!targetPl) return;

      const isMyPlaylist = !targetPl.isChartContext && (
        playlists.some(p => String(p.id) === String(targetPl.id)) ||
        (user && targetPl.user_id && targetPl.user_id === user.id)
      );

      if (isMyPlaylist) {
        const matchedPlaylist = playlists.find(p => String(p.id) === String(targetPl.id));
        const targetId = matchedPlaylist ? matchedPlaylist.id : targetPl.id;
        if (setActiveSharedPlaylist) setActiveSharedPlaylist(null);
        setSelectedPlaylistId(targetId);
      } else {
        if (setActiveSharedPlaylist) setActiveSharedPlaylist(targetPl);
        setSelectedPlaylistId(null);
      }

      setActiveTab('playlists');
      setIsEnteringDetail(true);
      setTimeout(() => {
        setIsEnteringDetail(false);
      }, 200);
    };

    const handleOpenQueue = () => {
      setActiveTab('queue');
    };

    window.addEventListener('trigger-open-shared-playlist', handleOpenSharedPlaylist);
    window.addEventListener('trigger-open-queue', handleOpenQueue);
    return () => {
      window.removeEventListener('trigger-open-shared-playlist', handleOpenSharedPlaylist);
      window.removeEventListener('trigger-open-queue', handleOpenQueue);
    };
  }, [setActiveSharedPlaylist, playlists, user]);

  useEffect(() => {
    if (activeSharedPlaylist) {
      // 내 소유 플레이리스트인지 검사 (실시간 차트 컨텍스트 제외)
      const isMyPlaylist = !activeSharedPlaylist.isChartContext && (
        playlists.some(p => String(p.id) === String(activeSharedPlaylist.id)) ||
        (user && activeSharedPlaylist.user_id && activeSharedPlaylist.user_id === user.id)
      );

      if (isMyPlaylist) {
        const matchedPlaylist = playlists.find(p => String(p.id) === String(activeSharedPlaylist.id));
        const targetId = matchedPlaylist ? matchedPlaylist.id : activeSharedPlaylist.id;

        if (setActiveSharedPlaylist) setActiveSharedPlaylist(null);
        setSelectedPlaylistId(targetId);
        setActiveTab('playlists');
        setIsEnteringDetail(true);
        const timer = setTimeout(() => {
          setIsEnteringDetail(false);
        }, 200);
        return () => clearTimeout(timer);
      }

      if (!previousSidebarStateRef.current) {
        previousSidebarStateRef.current = {
          selectedPlaylistId,
          activeTab,
        };
      }
      // 공유 플레이리스트 클릭 시 내 플레이리스트 탭으로 이동 & selectedPlaylistId 초기화
      setSelectedPlaylistId(null);
      setActiveTab('playlists');

      // 해당 플레이리스트가 사이드바에 나타날 때 zoom enter 애니메이션 적용
      const currentToken = activeSharedPlaylist._openedAt || activeSharedPlaylist.id;
      if (prevSharedPlaylistIdRef.current !== currentToken) {
        prevSharedPlaylistIdRef.current = currentToken;
        if (!isNavigatingBackRef.current) {
          setIsEnteringDetail(true);
          const timer = setTimeout(() => {
            setIsEnteringDetail(false);
          }, 180);
          return () => clearTimeout(timer);
        }
      }
    } else {
      prevSharedPlaylistIdRef.current = null;
    }
  }, [activeSharedPlaylist, playlists, user, setActiveSharedPlaylist]);

  // 차트 컨텍스트가 열릴 때:
  // 1) 백엔드가 pre-enriched한 durationSec을 durationCache에 즉시 등록
  // 2) 아직 youtube_video_id가 없는 트랙만 폴백으로 개별 검색
  useEffect(() => {
    if (!activeSharedPlaylist?.isChartContext) {
      setResolvedChartTracks(null);
      return;
    }

    const tracks = activeSharedPlaylist.tracks || [];
    setResolvedChartTracks([...tracks]);

    // 백엔드 pre-enriched durationSec → 즉시 durationCache에 등록
    tracks.forEach(track => {
      if (track.youtube_video_id && track.durationSec && track.durationSec > 0) {
        durationCache.set(track.youtube_video_id, track.durationSec);
      }
    });

    // youtube_video_id가 없는 트랙만 폴백 검색 (백엔드 enrichment가 아직 완료 안 된 경우)
    const unresolved = tracks.filter(t => !t.youtube_video_id);
    if (unresolved.length === 0) return;

    if (resolveAbortRef.current) {
      resolveAbortRef.current.abort();
    }
    const abortController = new AbortController();
    resolveAbortRef.current = abortController;

    const queries = unresolved.map(t => `${t.custom_title || t.title} ${t.custom_artist || t.artist}`);
    fetchVideoDurations(queries).then(results => {
      if (abortController.signal.aborted) return;
      if (!results || results.length === 0) return;

      const durationMap = new Map();
      results.forEach(item => {
        if (item?.query && item?.durationSec > 0) {
          durationMap.set(item.query, item.durationSec);
        }
      });

      setResolvedChartTracks(prev => {
        if (!prev) return prev;
        return prev.map(t => {
          if (t.youtube_video_id) return t;
          const q = `${t.custom_title || t.title} ${t.custom_artist || t.artist}`;
          const dur = durationMap.get(q);
          return dur ? { ...t, durationSec: dur } : t;
        });
      });
    }).catch(err => {
      console.warn('Fallback chart duration resolution error:', err);
    });

    return () => {
      abortController.abort();
    };
  }, [activeSharedPlaylist?.id]);

  // 폴더 클릭 핸들러 (통일된 180ms Zoom-In 애니메이션 적용)
  const handleSelectPlaylistFolder = (folderId) => {
    if (enteringFolderId || selectedPlaylistId) return;
    if (setActiveSharedPlaylist) setActiveSharedPlaylist(null);
    previousSidebarStateRef.current = null;
    setEnteringFolderId(folderId);

    setTimeout(() => {
      setSelectedPlaylistId(folderId);
      setEnteringFolderId(null);
      setIsEnteringDetail(true);

      setTimeout(() => {
        setIsEnteringDetail(false);
      }, 200);
    }, 200);
  };

  // 상세 뷰 뒤로가기 핸들러 (통일된 200ms Zoom-Out 애니메이션 적용 및 이전 상태 복원)
  const handleBackToFolderGrid = () => {
    if (isExitingDetail) return;
    setIsExitingDetail(true);

    setTimeout(() => {
      if (activeSharedPlaylist) {
        if (setActiveSharedPlaylist) setActiveSharedPlaylist(null);
        if (previousSidebarStateRef.current) {
          const { selectedPlaylistId: prevId, activeTab: prevTab } = previousSidebarStateRef.current;
          setSelectedPlaylistId(prevId || null);
          if (prevTab) setActiveTab(prevTab);
          previousSidebarStateRef.current = null;
        } else {
          setSelectedPlaylistId(null);
        }
      } else {
        setSelectedPlaylistId(null);
      }
      setIsExitingDetail(false);
      setIsEnteringFromDetail(true);

      setTimeout(() => {
        setIsEnteringFromDetail(false);
      }, 200);
    }, 200);
  };

  // Sync fetched tracks with AudioContext playlist state
  useEffect(() => {
    if (selectedPlaylistId) {
      setPlaylist(fetchedTracks || []);
    }
  }, [selectedPlaylistId, fetchedTracks, setPlaylist]);

  const handleCreatePlaylist = async ({ title, cover_url }) => {
    try {
      const newPl = await createPlaylistMutation.mutateAsync({ title, cover_url });
      setSelectedPlaylistId(newPl.id);
      showToast('플레이리스트가 생성되었습니다.');
    } catch (err) {
      console.error('Playlist creation error:', err);
      showToast(`생성 실패: ${err?.message || '알 수 없는 데이터베이스 오류'}`);
      throw err;
    }
  };

  const handleDeletePlaylist = async (playlistId, e) => {
    if (e) e.stopPropagation();
    if (!confirm('정말 이 플레이리스트를 삭제하시겠습니까?')) return;

    try {
      await deletePlaylistMutation.mutateAsync(playlistId);
      if (selectedPlaylistId === playlistId) {
        setSelectedPlaylistId(null);
      }
      showToast('플레이리스트가 삭제되었습니다.');
    } catch (err) {
      console.error('Delete playlist error:', err);
      showToast('삭제 중 오류가 발생했습니다.');
    }
  };

  const openEditModal = (pl, e) => {
    if (e) e.stopPropagation();
    setEditingPlaylist(pl);
  };

  const handleUpdatePlaylistInfo = async ({ title, cover_url }) => {
    if (!editingPlaylist) return;

    try {
      await updatePlaylistMutation.mutateAsync({
        playlistId: editingPlaylist.id,
        title,
        cover_url,
      });
      showToast('플레이리스트 정보가 수정되었습니다.');
    } catch (err) {
      console.error('Update playlist error:', err);
      showToast('정보 수정 중 오류가 발생했습니다.');
      throw err;
    }
  };

  const handleToggleSharePlaylist = async (pl, e) => {
    if (e) e.stopPropagation();
    const nextPublicState = !pl.is_public;
    const count = (playlistPreviews[pl.id] || []).length;
    if (nextPublicState && count === 0) {
      showToast('곡이 없는 빈 플레이리스트는 공유할 수 없습니다.');
      return;
    }
    try {
      await updatePlaylistMutation.mutateAsync({
        playlistId: pl.id,
        is_public: nextPublicState,
      });
      if (nextPublicState) {
        showToast(`'${pl.title}' 플레이리스트가 공유 플레이리스트에 등록되었습니다.`);
      } else {
        showToast(`'${pl.title}' 공유가 해제되었습니다.`);
      }
    } catch (err) {
      console.error('Toggle share playlist error:', err);
      showToast('공유 상태 변경 중 오류가 발생했습니다.');
    }
  };

  const handleAddPlaylistToQueue = async (playlistId, e) => {
    if (e) e.stopPropagation();
    let tracks = [];
    if (user && !user.isGuest && supabase) {
      const { data } = await supabase
        .from('tracks')
        .select('*')
        .eq('playlist_id', playlistId)
        .order('sequence', { ascending: true });
      if (data && data.length > 0) tracks = data;
    } else {
      const localTr = localStorage.getItem('sofar_tracks');
      if (localTr) {
        const parsed = JSON.parse(localTr);
        tracks = parsed.filter(t => t.playlist_id === playlistId).sort((a, b) => a.sequence - b.sequence);
      }
    }

    if (!tracks || tracks.length === 0) {
      tracks = playlistPreviews[playlistId] || [];
    }

    if (!tracks || tracks.length === 0) {
      showToast('대기열에 추가할 곡이 없습니다.');
      return;
    }

    setQueue(prev => [...prev, ...tracks]);
    setActiveTab('queue');
    const targetPl = playlists.find(p => p.id === playlistId);
    showToast(`'${targetPl?.title || '플레이리스트'}' ${tracks.length}곡을 대기열에 추가했습니다.`);
  };

  const isMyPlaylist = activeSharedPlaylist && !activeSharedPlaylist.isChartContext && (
    playlists.some(p => String(p.id) === String(activeSharedPlaylist.id)) ||
    (user && activeSharedPlaylist.user_id && activeSharedPlaylist.user_id === user.id)
  );
  const isReadOnlyShared = !!(activeSharedPlaylist && !isMyPlaylist);

  const getCurrentDetailTracks = () => {
    if (activeSharedPlaylist) {
      if (activeSharedPlaylist.isChartContext) {
        return resolvedChartTracks || activeSharedPlaylist.tracks || [];
      }
      if (!isReadOnlyShared && fetchedTracks && fetchedTracks.length > 0) {
        return fetchedTracks;
      }
      return activeSharedPlaylist.tracks || [];
    }
    if (fetchedTracks && fetchedTracks.length > 0) {
      return fetchedTracks;
    }
    if (selectedPlaylistId && playlistPreviews[selectedPlaylistId]) {
      return playlistPreviews[selectedPlaylistId];
    }
    return fetchedTracks || [];
  };

  const handlePlayAllDetail = (e) => {
    if (e) e.stopPropagation();
    const tracks = getCurrentDetailTracks();
    if (!tracks || tracks.length === 0) {
      showToast('재생할 곡이 없습니다.');
      return;
    }
    const title = activeSharedPlaylist
      ? activeSharedPlaylist.title
      : (playlists.find(p => p.id === selectedPlaylistId)?.title || '플레이리스트');

    // 전체 재생은 사용자가 명시적으로 구성한 대기열을 건드리지 않고,
    // 현재 플레이리스트를 연속 재생 컨텍스트로만 설정한다.
    playTrack(tracks[0], tracks);
    if (activeSharedPlaylist) {
      if (setPlayingSource) setPlayingSource({ type: 'shared', data: activeSharedPlaylist });
    } else if (selectedPlaylistId) {
      if (setPlayingSource) setPlayingSource({ type: 'my', playlistId: selectedPlaylistId });
    }
    showToast(`'${title}' ${tracks.length}곡 전체 재생`);
  };

  const detailKey = activeSharedPlaylist
    ? `shared_${activeSharedPlaylist.id}`
    : selectedPlaylistId
    ? `my_${selectedPlaylistId}`
    : null;

  const isDetailShuffle = isShuffleFor ? isShuffleFor(detailKey) : false;
  const isQueueShuffle = isShuffleFor ? isShuffleFor('queue') : false;

  const handleShufflePlayDetail = (e) => {
    if (e) e.stopPropagation();
    const tracks = getCurrentDetailTracks();
    if (!tracks || tracks.length === 0) {
      showToast('재생할 곡이 없습니다.');
      return;
    }
    const title = activeSharedPlaylist
      ? activeSharedPlaylist.title
      : (playlists.find(p => p.id === selectedPlaylistId)?.title || '플레이리스트');

    const isCurrentPlaylistPlaying = currentTrack && tracks.some(t => 
      t.id === currentTrack.id || (t.youtube_video_id && currentTrack.youtube_video_id && t.youtube_video_id === currentTrack.youtube_video_id)
    );

    const nextState = !isDetailShuffle;
    if (toggleShuffleFor) toggleShuffleFor(detailKey, nextState);

    if (!nextState) {
      showToast('셔플 재생 해제');
    } else {
      if (isCurrentPlaylistPlaying) {
        showToast('셔플 재생 켬');
      } else {
        const randomIndex = Math.floor(Math.random() * tracks.length);
        const startTrack = tracks[randomIndex];
        setQueue([...tracks]);
        if (activeSharedPlaylist) {
          if (setPlayingSource) setPlayingSource({ type: 'shared', data: activeSharedPlaylist });
        } else if (selectedPlaylistId) {
          if (setPlayingSource) setPlayingSource({ type: 'my', playlistId: selectedPlaylistId });
        }
        playTrack(startTrack, tracks);
        showToast(`'${title}' ${tracks.length}곡 셔플 재생`);
      }
    }
  };

  const handleClearQueue = (e) => {
    if (e) e.stopPropagation();
    if (queue.length === 0) {
      showToast('대기열이 비어 있습니다.');
      return;
    }
    setQueue([]);
    showToast('대기열을 전체 삭제했습니다.');
  };

  const handlePlayAllQueue = (e) => {
    if (e) e.stopPropagation();
    if (!queue || queue.length === 0) {
      showToast('대기열에 곡이 없습니다.');
      return;
    }
    playTrack(queue[0], queue);
    if (setPlayingSource) setPlayingSource({ type: 'queue' });
    showToast('대기열 전체 재생');
  };

  const handleShufflePlayQueue = (e) => {
    if (e) e.stopPropagation();
    if (!queue || queue.length === 0) {
      showToast('대기열에 곡이 없습니다.');
      return;
    }
    const nextState = !isQueueShuffle;
    if (toggleShuffleFor) toggleShuffleFor('queue', nextState);

    if (!nextState) {
      showToast('셔플 재생 해제');
    } else {
      const isCurrentInQueue = currentTrack && queue.some(t => 
        t.id === currentTrack.id || (t.youtube_video_id && currentTrack.youtube_video_id && t.youtube_video_id === currentTrack.youtube_video_id)
      );
      if (isCurrentInQueue && isPlaying) {
        showToast('셔플 재생 켬');
      } else {
        const randomIndex = Math.floor(Math.random() * queue.length);
        const startTrack = queue[randomIndex];
        if (setPlayingSource) setPlayingSource({ type: 'queue' });
        playTrack(startTrack, queue);
        showToast('대기열 셔플 재생');
      }
    }
  };

  const render2x2Cover = (pl) => {
    const plObj = typeof pl === 'object' ? pl : playlists.find(p => p.id === pl);
    const playlistId = typeof pl === 'object' ? pl?.id : pl;

    let customCoversMap = {};
    try {
      const localCovers = localStorage.getItem('sofar_playlist_covers');
      if (localCovers) customCoversMap = JSON.parse(localCovers);
    } catch (e) {}

    const customCover = customCoversMap[playlistId] || plObj?.cover_url || plObj?.cover;

    if (customCover) {
      return (
        <div className="folder-tile-cover custom-cover">
          <img src={customCover} alt={plObj?.title || 'Cover'} className="folder-custom-cover-img" />
        </div>
      );
    }

    const previewTracks = playlistPreviews[playlistId] || [];
    const slots = [0, 1, 2, 3];

    return (
      <div className="folder-tile-cover">
        {slots.map(index => {
          const track = previewTracks[index];
          if (track && (track.youtube_video_id || track.custom_title)) {
            return (
              <div key={index} className="folder-tile-cell">
                <TrackThumbnail 
                  title={track.custom_title} 
                  artist={track.custom_artist} 
                  youtubeId={track.youtube_video_id} 
                  artwork={track.artwork}
                />
              </div>
            );
          }
          return (
            <div key={index} className="folder-tile-cell empty">
              <Music size={14} className="empty-cell-icon" />
            </div>
          );
        })}
      </div>
    );
  };

  const handleTrackInserted = (newTrack, needLlmRefine, rawTitle, rawChannel) => {
    setPlaylist(prev => [...prev, { ...newTrack, isRefining: needLlmRefine }]);
    if (needLlmRefine) {
      refineTrackMetadata(newTrack.id, newTrack.youtube_video_id, rawTitle, rawChannel);
    }
  };

  // 백그라운드 로컬 LLM 정밀 가공 프로세스
  const refineTrackMetadata = async (trackId, videoId, rawTitle, rawChannel) => {
    let cleaned = null;

    const sp = (user && !user.isGuest && supabase);
    if (sp) {
      try {
        // 이미 다른 유저나 자신이 정제한 메타데이터가 데이터베이스에 있는지 확인
        const { data, error } = await supabase
          .from('tracks')
          .select('custom_title, custom_artist')
          .eq('youtube_video_id', videoId)
          .neq('id', trackId)
          .not('custom_title', 'is', null)
          .not('custom_artist', 'is', null)
          .neq('custom_title', '유튜브 동영상')
          .limit(1);

        if (!error && data && data.length > 0) {
          cleaned = {
            title: data[0].custom_title,
            artist: data[0].custom_artist
          };
        }
      } catch (e) {
        console.warn('Failed to query existing track from DB:', e);
      }
    } else {
      try {
        // 로컬 스토리지에 이미 정제된 트랙이 있는지 확인
        const localTr = localStorage.getItem('sofar_tracks');
        if (localTr) {
          const parsed = JSON.parse(localTr);
          const matched = parsed.find(
            t => t.youtube_video_id === videoId && 
            t.custom_title && 
            t.custom_title !== '유튜브 동영상' &&
            t.id !== trackId // 현재 가공 중인 자기 자신 제외
          );
          if (matched) {
            cleaned = {
              title: matched.custom_title,
              artist: matched.matched_artist || matched.custom_artist
            };
          }
        }
      } catch (e) {
        console.warn('Failed to query existing track from localStorage:', e);
      }
    }

    // 기존 정제본이 없으면 LLM 정제 진행
    if (!cleaned) {
      cleaned = await extractMetadataWithLocalLLM(rawTitle, rawChannel);
    }
    
    // LLM도 실패하면 정규식 가공 진행
    if (!cleaned) {
      cleaned = cleanYoutubeMetadata(rawTitle, rawChannel);
    }

    const updates = {
      custom_title: cleaned.title,
      custom_artist: cleaned.artist,
      isRefining: false
    };

    setPlaylist(prev => prev.map(t => t.id === trackId ? { ...t, ...updates } : t));
    
    if (currentTrack && currentTrack.id === trackId) {
      playTrack({ ...currentTrack, ...updates });
    }

    if (sp) {
      await supabase
        .from('tracks')
        .update({
          custom_title: cleaned.title,
          custom_artist: cleaned.artist
        })
        .eq('id', trackId);
    } else {
      const localTr = localStorage.getItem('sofar_tracks');
      if (localTr) {
        const parsed = JSON.parse(localTr);
        const updated = parsed.map(t => t.id === trackId ? { ...t, custom_title: cleaned.title, custom_artist: cleaned.artist } : t);
        localStorage.setItem('sofar_tracks', JSON.stringify(updated));
      }
    }
  };

  const handleDeleteTrack = async (trackId) => {
    try {
      await deleteTrackMutation.mutateAsync({ trackId, playlistId: selectedPlaylistId });
      showToast('곡이 플레이리스트에서 삭제되었습니다.');
    } catch (err) {
      console.error('Delete track error:', err);
      showToast('삭제 중 오류가 발생했습니다.');
    }
  };

  const addToQueue = (track, action = 'end') => {
    const normalizedTrack = {
      ...track,
      id: track.id ? `tr-queue-${track.id}-${Date.now()}` : `tr-queue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      lyric_offset: track.lyric_offset ?? 0,
      custom_lyrics: track.custom_lyrics ?? ''
    };

    setQueue(prev => {
      const filtered = prev.filter(t => t.youtube_video_id !== normalizedTrack.youtube_video_id);
      if (action === 'next') {
        const currentIdx = currentTrack ? filtered.findIndex(t => t.id === currentTrack.id) : -1;
        if (currentIdx !== -1) {
          const nextQueue = [...filtered];
          nextQueue.splice(currentIdx + 1, 0, normalizedTrack);
          return nextQueue;
        }
        return [normalizedTrack, ...filtered];
      } else {
        return [...filtered, normalizedTrack];
      }
    });
    setActiveTab('queue');
    showToast(action === 'next' ? '대기열 다음 재생 목록에 추가했습니다.' : '대기열 뒤에 추가했습니다.');
  };

  const removeFromQueue = (trackId) => {
    setQueue(prev => prev.filter(t => t.id !== trackId));
    showToast('대기열에서 곡을 제외했습니다.');
  };

  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.setData('text/plain', index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';

    const rect = e.currentTarget.getBoundingClientRect();
    const relativeY = e.clientY - rect.top;
    const position = relativeY < rect.height / 2 ? 'top' : 'bottom';

    // 인접 아이템 간의 border 정렬 차이로 인한 1px 유격 흔들림 현상을 방지하기 위해,
    // 마지막 아이템을 제외한 모든 'bottom' 위치는 다음 아이템의 'top'으로 단일화(정규화)합니다.
    let targetIndex = index;
    let targetPosition = position;
    if (position === 'bottom' && index < queue.length - 1) {
      targetIndex = index + 1;
      targetPosition = 'top';
    }

    if (draggedIndex !== null) {
      // 무의미한 위치 이동(예: 자신의 바로 위/아래 등 실제 순서 변경이 없는 상태)인 경우 가이드라인 표시 생략
      const boundaryIndex = targetPosition === 'top' ? targetIndex : targetIndex + 1;
      const insertIndex = draggedIndex < boundaryIndex ? boundaryIndex - 1 : boundaryIndex;

      if (insertIndex === draggedIndex) {
        if (dragOverInfo !== null) {
          setDragOverInfo(null);
        }
        return;
      }
    }

    if (!dragOverInfo || dragOverInfo.index !== targetIndex || dragOverInfo.position !== targetPosition) {
      setDragOverInfo({ index: targetIndex, position: targetPosition });
    }
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverInfo(null);
  };

  const handleDrop = (e, targetIndex) => {
    e.preventDefault();
    e.stopPropagation();

    // 1) 대기열 내부 아이템 순서 변경
    if (draggedIndex !== null) {
      let insertIndex = draggedIndex;
      if (dragOverInfo) {
        const boundaryIndex = dragOverInfo.position === 'top' ? dragOverInfo.index : dragOverInfo.index + 1;
        insertIndex = draggedIndex < boundaryIndex ? boundaryIndex - 1 : boundaryIndex;
      } else {
        const boundaryIndex = targetIndex;
        insertIndex = draggedIndex < boundaryIndex ? boundaryIndex - 1 : boundaryIndex;
      }

      if (draggedIndex !== insertIndex) {
        const newQueue = [...queue];
        const [movedItem] = newQueue.splice(draggedIndex, 1);
        newQueue.splice(insertIndex, 0, movedItem);
        setQueue(newQueue);
      }

      setDraggedIndex(null);
      setDragOverInfo(null);
      return;
    }

    // 2) 외부 트랙(홈 화면 곡, 검색 곡, 플레이리스트 곡 등)을 대기열 특정 위치로 드롭한 경우
    try {
      const jsonStr = e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain');
      if (!jsonStr) return;
      const track = JSON.parse(jsonStr);
      if (!track || (!track.youtube_video_id && !track.custom_title && !track.title)) return;

      const normalizedTrack = {
        ...track,
        id: track.id && !queue.some(t => t.id === track.id) 
          ? track.id 
          : `tr-queue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        lyric_offset: track.lyric_offset ?? 0,
        custom_lyrics: track.custom_lyrics ?? ''
      };

      let insertIndex = queue.length;
      if (dragOverInfo) {
        insertIndex = dragOverInfo.position === 'top' ? dragOverInfo.index : dragOverInfo.index + 1;
      } else if (targetIndex !== undefined && targetIndex !== null) {
        insertIndex = targetIndex;
      }

      setQueue(prev => {
        const existingIdx = prev.findIndex(t => 
          (t.youtube_video_id && normalizedTrack.youtube_video_id && t.youtube_video_id === normalizedTrack.youtube_video_id) ||
          (t.id && normalizedTrack.id && t.id === normalizedTrack.id)
        );
        
        const filtered = prev.filter(t => 
          !(t.youtube_video_id && normalizedTrack.youtube_video_id && t.youtube_video_id === normalizedTrack.youtube_video_id) &&
          !(t.id && normalizedTrack.id && t.id === normalizedTrack.id)
        );

        let adjustedIndex = insertIndex;
        if (existingIdx !== -1 && existingIdx < insertIndex) {
          adjustedIndex = Math.max(0, insertIndex - 1);
        }
        adjustedIndex = Math.min(adjustedIndex, filtered.length);

        const nextQueue = [...filtered];
        nextQueue.splice(adjustedIndex, 0, normalizedTrack);
        return nextQueue;
      });

      const title = track.custom_title || track.title || '제목 없음';
      showToast(`'${title}' 곡을 대기열에 추가했습니다.`);
    } catch (err) {
      console.warn('Drop to queue item failed:', err);
    } finally {
      setDraggedIndex(null);
      setDragOverInfo(null);
      setIsQueueDragOver(false);
    }
  };

  const handleContainerDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';

    // 이벤트 타겟이 리스트 본체(빈 영역)이거나 빈 리스트 메시지일 때만 컨테이너 레벨 처리
    const isDirectContainer = e.target === e.currentTarget || e.target.classList?.contains('empty-list-message');
    if (!isDirectContainer) return;

    // 1) 내부 대기열 아이템 이동 중인 경우
    if (draggedIndex !== null) {
      if (queue.length === 0) return;
      const lastIndex = queue.length - 1;
      if (draggedIndex === lastIndex) {
        if (dragOverInfo !== null) setDragOverInfo(null);
        return;
      }
      const targetIndex = lastIndex;
      const targetPosition = 'bottom';
      if (!dragOverInfo || dragOverInfo.index !== targetIndex || dragOverInfo.position !== targetPosition) {
        setDragOverInfo({ index: targetIndex, position: targetPosition });
      }
      return;
    }

    // 2) 외부 트랙 드래그 중인 경우
    if (queue.length === 0) {
      if (!isQueueDragOver) setIsQueueDragOver(true);
      if (dragOverInfo !== null) setDragOverInfo(null);
    } else {
      const lastIndex = queue.length - 1;
      const targetPosition = 'bottom';
      if (!dragOverInfo || dragOverInfo.index !== lastIndex || dragOverInfo.position !== targetPosition) {
        setDragOverInfo({ index: lastIndex, position: targetPosition });
      }
      if (isQueueDragOver) setIsQueueDragOver(false);
    }
  };

  const handleContainerDragLeave = (e) => {
    e.preventDefault();
    if (e.currentTarget && e.currentTarget.contains(e.relatedTarget)) {
      return;
    }
    if (draggedIndex === null) {
      setIsQueueDragOver(false);
      setDragOverInfo(null);
    }
  };

  const handleContainerDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();

    // 1) 내부 대기열 아이템 이동
    if (draggedIndex !== null) {
      if (queue.length === 0) return;
      const lastIndex = queue.length - 1;
      if (draggedIndex !== lastIndex) {
        const newQueue = [...queue];
        const [movedItem] = newQueue.splice(draggedIndex, 1);
        newQueue.push(movedItem);
        setQueue(newQueue);
      }
      setDraggedIndex(null);
      setDragOverInfo(null);
      return;
    }

    // 2) 외부 트랙을 대기열 끝 또는 빈 대기열에 드롭
    handleQueueDrop(e);
  };

  const moveQueueItem = (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= queue.length) return;
    
    const newQueue = [...queue];
    const [movedItem] = newQueue.splice(index, 1);
    newQueue.splice(targetIndex, 0, movedItem);
    setQueue(newQueue);
  };

  const handleNowPlayingClick = useCallback(() => {
    navigate('/now');

    // 재생 중인 곡이 없는 경우 현재 사이드바 뷰(탭 및 열린 플레이리스트) 상태 유지
    if (!currentTrack) {
      return;
    }

    let targetTab = 'queue';
    let targetSelectedId = null;
    let targetSharedData = null;

    // 1. 현재 재생 출처(playingSource)가 shared(백그라운드 차트/공유 플레이리스트)인 경우
    if (playingSource?.type === 'shared' && playingSource?.data) {
      targetTab = 'playlists';
      targetSharedData = playingSource.data;
    } 
    // 2. 현재 재생 중인 트랙(currentTrack)이 활성화된 공유/차트 플레이리스트(activeSharedPlaylist)에 포함된 경우
    else if (
      activeSharedPlaylist &&
      currentTrack &&
      activeSharedPlaylist.tracks &&
      activeSharedPlaylist.tracks.some(t => isMatchTrack(t, currentTrack))
    ) {
      targetTab = 'playlists';
      targetSharedData = activeSharedPlaylist;
    }
    // 3. 현재 사이드바에 백그라운드/공유 플레이리스트(activeSharedPlaylist)가 열려 있거나 선택된 경우 (현재 뷰 보존)
    else if (activeSharedPlaylist) {
      targetTab = 'playlists';
      targetSharedData = activeSharedPlaylist;
    }
    // 4. 현재 재생 출처가 내 플레이리스트(my)인 경우
    else if (playingSource?.type === 'my' && playingSource?.playlistId) {
      targetTab = 'playlists';
      targetSelectedId = playingSource.playlistId;
    }
    // 5. 현재 재생 곡이 내 플레이리스트 곡인 경우
    else if (currentTrack?.playlist_id && playlists.some(p => String(p.id) === String(currentTrack.playlist_id))) {
      targetTab = 'playlists';
      targetSelectedId = currentTrack.playlist_id;
    }
    // 6. 현재 사이드바에서 내 플레이리스트가 선택되어 있는 경우
    else if (selectedPlaylistId) {
      targetTab = 'playlists';
      targetSelectedId = selectedPlaylistId;
    }
    // 7. 그 외 대기열(queue) 재생 중이거나 기본 상태
    else if (playingSource?.type === 'queue') {
      targetTab = 'queue';
    }

    const currentSharedId = activeSharedPlaylist ? String(activeSharedPlaylist.id) : null;
    const targetSharedId = targetSharedData ? String(targetSharedData.id) : null;
    const currentSelectedIdStr = selectedPlaylistId != null ? String(selectedPlaylistId) : null;
    const targetSelectedIdStr = targetSelectedId != null ? String(targetSelectedId) : null;

    const isSameView = 
      activeTab === targetTab &&
      currentSelectedIdStr === targetSelectedIdStr &&
      currentSharedId === targetSharedId;

    if (isSameView) {
      // 이미 해당 화면일 때는 부드럽게(smooth) 현재 재생 음악으로 스크롤 이동
      setTimeout(() => {
        const activeEl = document.querySelector('.playlist-sidebar-container .track-row-item.active');
        if (activeEl) {
          activeEl.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest'
          });
        }
      }, 50);
      return;
    }

    // 다른 화면일 때는 해당 화면으로 전환
    if (targetTab === 'playlists') {
      if (setActiveSharedPlaylist) setActiveSharedPlaylist(targetSharedData);
      setSelectedPlaylistId(targetSelectedId);
      setActiveTab('playlists');
    } else {
      if (setActiveSharedPlaylist) setActiveSharedPlaylist(null);
      setSelectedPlaylistId(null);
      setActiveTab('queue');
    }

    // 화면 전환 후 현재 재생 중인 음악으로 자동 스크롤
    setTimeout(() => {
      const activeEl = document.querySelector('.playlist-sidebar-container .track-row-item.active');
      if (activeEl) {
        activeEl.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest'
        });
      }
    }, 120);
  }, [navigate, playingSource, currentTrack, playlists, activeSharedPlaylist, selectedPlaylistId, activeTab, setActiveSharedPlaylist]);

  // 외부(하단 플레이어 바 클릭 등)에서 NOW PLAYING 복원이 요청되었을 때 동기 수신 처리
  useEffect(() => {
    const handleRestoreNowPlaying = () => {
      handleNowPlayingClick();
    };
    window.addEventListener('trigger-restore-now-playing-view', handleRestoreNowPlaying);
    return () => {
      window.removeEventListener('trigger-restore-now-playing-view', handleRestoreNowPlaying);
    };
  }, [handleNowPlayingClick]);

  return (
    <div 
      ref={sidebarRef}
      className={`playlist-sidebar-container ${currentTrack ? 'has-current-track' : 'no-current-track'}`}
    >
      {/* 로고 및 액션 헤더 영역 */}
      <div className="sidebar-logo-section">
        <Logo iconSize={26} titleSize={30} />
        <div className="sidebar-logo-actions">
          <Button 
            onClick={() => navigate('/')} 
            variant="icon"
            size="lg"
            className={location.pathname === '/' || location.pathname === '/home' ? 'active' : ''}
            title="홈 화면"
            aria-label="홈 화면"
            leadingIcon={<Home size={20} />}
          />
          <Button 
            onClick={handleNowPlayingClick} 
            variant="icon"
            size="lg"
            className={location.pathname === '/now' || location.pathname === '/now-playing' ? 'active' : ''}
            title="NOW PLAYING"
            aria-label="현재 재생 뷰"
            leadingIcon={<Headphones size={20} />}
          />
          <Button 
            onClick={() => navigate('/search')} 
            variant="icon"
            size="lg"
            className={location.pathname === '/search' ? 'active' : ''}
            title="음악 검색"
            aria-label="음악 검색"
            leadingIcon={<Search size={20} />}
          />
        </div>
      </div>

      <div className="playlist-content-body scrollbar-none">
        
        {/* 탭 1: 플레이리스트 뷰 */}
        {activeTab === 'playlists' && (
          <div className="tab-content-panel">
            {!selectedPlaylistId && !activeSharedPlaylist ? (
              /* --- 1) 폴더 그리드 뷰 (Windows 탐색기 폴더 스타일) --- */
              <div className="tab-content-panel playlist-list-panel">
                {/* 플레이리스트 목록 상단 헤더 (순수 페이드 애니메이션) */}
                <div className="playlist-detail-header list-header">
                  <div className={`playlist-detail-header-inner ${enteringFolderId ? 'header-fade-out' : ''} ${isEnteringFromDetail ? 'header-fade-in' : ''}`}>
                    <div className="playlist-detail-title-area">
                      <h3 className="playlist-detail-title">
                        <LayoutGrid size={20} strokeWidth={1.5} className="title-icon" />
                        내 플레이리스트
                      </h3>
                    </div>
                    <div className="playlist-detail-header-actions">
                      <Button 
                        variant="icon"
                        size="md"
                        onClick={() => setIsCreateModalOpen(true)}
                        title="새 플레이리스트 추가"
                        aria-label="새 플레이리스트 추가"
                        leadingIcon={<Plus size={16} />}
                      />
                    </div>
                  </div>
                </div>

                {/* 본문 폴더 그리드 (줌 & 페이드 애니메이션) */}
                <div className={`playlist-grid-wrapper ${enteringFolderId ? 'is-leaving' : ''} ${isEnteringFromDetail ? 'grid-enter-zoom' : ''}`}>
                  <div className="playlist-grid-container scrollbar-none">
                    <div className="playlist-folder-grid">
                      {playlists.map((pl, plIdx) => {
                        const count = (playlistPreviews[pl.id] || []).length;
                        const folderDropdownOptions = [
                          {
                            label: '대기열 추가',
                            icon: <ListPlus size={16} />,
                            onClick: () => handleAddPlaylistToQueue(pl.id)
                          },
                          {
                            label: '정보 수정',
                            icon: <Pencil size={14} />,
                            onClick: () => openEditModal(pl)
                          },
                          ...(count > 0 || pl.is_public ? [
                            {
                              label: pl.is_public ? '공유 해제' : '공유하기',
                              icon: <Share2 size={14} style={{ color: pl.is_public ? 'var(--primary-warm, #ff6b6b)' : 'inherit' }} />,
                              onClick: (e) => handleToggleSharePlaylist(pl, e)
                            }
                          ] : []),
                          {
                            label: '삭제',
                            icon: <Trash2 size={14} />,
                            className: 'btn-delete',
                            onClick: () => handleDeletePlaylist(pl.id)
                          }
                        ];

                        const isEnteringThisFolder = enteringFolderId === pl.id;

                        return (
                          <div 
                            key={pl.id} 
                            className={`folder-card stagger-fade-item ${isEnteringThisFolder ? 'entering-zoom' : ''} ${dragOverFolderId === pl.id ? 'drag-over' : ''}`}
                            style={getStaggerStyle(plIdx)}
                            onClick={() => handleSelectPlaylistFolder(pl.id)}
                            onDragOver={(e) => handleFolderDragOver(e, pl.id)}
                            onDragLeave={(e) => handleFolderDragLeave(e, pl.id)}
                            onDrop={(e) => handleFolderDrop(e, pl)}
                          >
                            <div className="folder-card-cover-wrapper">
                              {render2x2Cover(pl)}
                            </div>
                            <div className="folder-card-info">
                              <div className="folder-card-header-row">
                                <span className="folder-card-title" title={pl.title}>{pl.title}</span>
                                <div onClick={(e) => e.stopPropagation()}>
                                  <Dropdown 
                                    options={folderDropdownOptions} 
                                    align="right"
                                    trigger={(isOpen) => (
                                      <button 
                                        className={`folder-kebab-trigger-btn ${isOpen ? 'active' : ''}`}
                                        title="더보기"
                                      >
                                        <MoreVertical size={14} strokeWidth={1.5} fill="currentColor" />
                                      </button>
                                    )}
                                  />
                                </div>
                              </div>
                              <span className="folder-card-count">
                                {playlistPreviews[pl.id] ? `${playlistPreviews[pl.id].length}곡` : '0곡'}
                                {pl.is_public ? ' · 공유됨' : ''}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>
              </div>
            ) : (
              /* --- 2) 단일 플레이리스트 곡 목록 상세 뷰 (뒤로가기 포함) --- */
              <div className="tab-content-panel playlist-detail-wrapper">
                {/* 상세 뷰 상단 뒤로가기 및 제목 헤더 (순수 페이드 애니메이션) */}
                <div className="playlist-detail-header detail-header">
                  <div key={activeSharedPlaylist ? activeSharedPlaylist.id : (selectedPlaylistId || 'header-detail')} className={`playlist-detail-header-inner ${isExitingDetail ? 'header-fade-out' : 'header-fade-in'}`}>
                    <Button 
                      variant="icon"
                      size="md"
                      onClick={handleSidebarBack}
                      onDragOver={handleBackDragOver}
                      onDragLeave={handleBackDragLeave}
                      onDrop={handleBackDrop}
                      className={isBackDragOver ? 'drag-over-btn' : ''}
                      title="이전 화면으로 돌아가기"
                      aria-label="이전 화면으로 돌아가기"
                      leadingIcon={<ChevronLeft size={20} strokeWidth={1.75} />}
                    />
                    
                    <div className="playlist-detail-title-area">
                      <h3 className="playlist-detail-title">
                        {activeSharedPlaylist ? activeSharedPlaylist.title : (playlists.find(p => p.id === selectedPlaylistId)?.title || '플레이리스트')}
                      </h3>
                      {!isReadOnlyShared && (
                        <button 
                          onClick={(e) => {
                            const currentPl = playlists.find(p => String(p.id) === String(selectedPlaylistId || activeSharedPlaylist?.id));
                            if (currentPl) openEditModal(currentPl, e);
                          }}
                          className="bottom-edit-btn"
                          title="플레이리스트 이름 수정"
                          aria-label="플레이리스트 이름 수정"
                        >
                          <Pencil size={14} strokeWidth={1.5} />
                        </button>
                      )}
                    </div>

                    <div className="playlist-detail-header-actions">
                      <Button 
                        variant="icon"
                        size="md"
                        onClick={handlePlayAllDetail}
                        title="전체 재생"
                        aria-label="전체 재생"
                        leadingIcon={<Play size={16} />}
                      />
                      <Button 
                        variant="icon"
                        size="md"
                        onClick={handleShufflePlayDetail}
                        className={isDetailShuffle ? 'active' : ''}
                        title={isDetailShuffle ? "셔플 재생 켬" : "셔플 재생 끔"}
                        aria-label={isDetailShuffle ? "셔플 재생 켬" : "셔플 재생 끔"}
                        leadingIcon={<Shuffle size={16} />}
                      />
                      <Button 
                        variant="icon"
                        size="md"
                        onClick={(e) => {
                          if (activeSharedPlaylist) {
                            const tracks = getCurrentDetailTracks();
                            if (tracks.length > 0) {
                              setQueue(prev => [...prev, ...tracks]);
                              setActiveTab('queue');
                              showToast(`'${activeSharedPlaylist.title}' ${tracks.length}곡을 대기열에 추가했습니다.`);
                            } else {
                              showToast('대기열에 추가할 곡이 없습니다.');
                            }
                          } else {
                            handleAddPlaylistToQueue(selectedPlaylistId, e);
                          }
                        }}
                        title="대기열에 전체 곡 추가"
                        aria-label="대기열에 전체 곡 추가"
                        leadingIcon={<ListPlus size={16} />}
                      />
                    </div>
                  </div>
                </div>

                {/* 본문 곡 목록 (줌 & 페이드 애니메이션) */}
                <div 
                  key={activeSharedPlaylist ? activeSharedPlaylist.id : (selectedPlaylistId || 'detail-tracks')}
                  className={`track-item-list scrollbar-none ${isEnteringDetail ? 'detail-enter-zoom' : ''} ${isExitingDetail ? 'detail-exit-zoom' : ''} ${isDetailDragOver ? 'drag-over' : ''} ${!isTrackListVisible ? 'track-list-pre-scroll' : ''}`}
                  onDragOver={handleDetailDragOver}
                  onDragLeave={handleDetailDragLeave}
                  onDrop={handleDetailDrop}
                >
                  {(!activeSharedPlaylist && (isTracksLoading || isTracksFetching)) ? (
                    <div className="track-loading-skeleton-list delayed-skeleton-container">
                      {[1, 2, 3, 4].map((num) => (
                        <div key={num} className="track-skeleton-row">
                          <div className="track-skeleton-thumb" />
                          <div className="track-skeleton-info">
                            <div className="track-skeleton-title" />
                            <div className="track-skeleton-artist" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      {(() => {
                        const displayTracks = getCurrentDetailTracks();
                        const listContextId = activeSharedPlaylist?.id || selectedPlaylistId || 'local';
                        return displayTracks.map((track, idx) => (
                          <TrackRowItem 
                            key={`${listContextId}_${track.id || track.youtube_video_id || idx}_${idx}`}
                            track={track}
                            index={idx}
                            currentTrack={currentTrack}
                            isPlaying={isPlaying}
                            togglePlay={togglePlay}
                            playTrack={(t) => {
                              playTrack(t, displayTracks);
                              if (activeSharedPlaylist) {
                                if (setPlayingSource) setPlayingSource({ type: 'shared', data: activeSharedPlaylist });
                              } else if (selectedPlaylistId) {
                                if (setPlayingSource) setPlayingSource({ type: 'my', playlistId: selectedPlaylistId });
                              }
                            }}
                            addToQueue={addToQueue}
                            onDeleteTrack={isReadOnlyShared ? null : handleDeleteTrack}
                          />
                        ));
                      })()}
                      
                      {(activeSharedPlaylist ? (!activeSharedPlaylist.tracks || activeSharedPlaylist.tracks.length === 0) : (!fetchedTracks || fetchedTracks.length === 0)) && (
                        <div className="empty-list-message">
                          등록된 음악이 없습니다.
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 탭 2: 실시간 대기열 뷰 */}
        {activeTab === 'queue' && (
          <div 
            className={`tab-content-panel queue-list-panel ${isQueueDragOver ? 'drag-over' : ''}`}
            onDragOver={handleQueueDragOver}
            onDragLeave={handleQueueDragLeave}
            onDrop={handleQueueDrop}
          >
            <div className="playlist-detail-header queue-header">
              <div key="header-queue" className="playlist-detail-header-inner header-fade-in">
                <Button 
                  variant="icon"
                  size="md"
                  onClick={handleSidebarBack}
                  onDragOver={handleBackDragOver}
                  onDragLeave={handleBackDragLeave}
                  onDrop={handleBackDrop}
                  className={isBackDragOver ? 'drag-over-btn' : ''}
                  title="이전 화면으로 돌아가기"
                  aria-label="이전 화면으로 돌아가기"
                  leadingIcon={<ChevronLeft size={20} strokeWidth={1.75} />}
                />
                <div className="playlist-detail-title-area">
                  <h3 className="playlist-detail-title">
                    대기열
                  </h3>
                </div>
                <div className="playlist-detail-header-actions">
                  <Button 
                    variant="icon"
                    size="md"
                    onClick={handlePlayAllQueue}
                    title="전체 재생"
                    aria-label="전체 재생"
                    leadingIcon={<Play size={16} />}
                  />
                  <Button 
                    variant="icon"
                    size="md"
                    onClick={handleShufflePlayQueue}
                    className={isQueueShuffle ? 'active' : ''}
                    title={isQueueShuffle ? "셔플 재생 켬" : "셔플 재생 끔"}
                    aria-label={isQueueShuffle ? "셔플 재생 켬" : "셔플 재생 끔"}
                    leadingIcon={<Shuffle size={16} />}
                  />
                  <Button 
                    variant="icon"
                    size="md"
                    onClick={handleClearQueue}
                    title="전체 삭제"
                    aria-label="전체 삭제"
                    leadingIcon={<Trash2 size={16} />}
                  />
                </div>
              </div>
            </div>

            <div 
              className="track-item-list scrollbar-none"
              onDragOver={handleContainerDragOver}
              onDragLeave={handleContainerDragLeave}
              onDrop={handleContainerDrop}
            >
              {queue.map((track, index) => (
                <QueueRowItem 
                  key={`queue-${track.id}-${index}`}
                  track={track}
                  index={index}
                  currentTrack={currentTrack}
                  isPlaying={isPlaying}
                  togglePlay={togglePlay}
                  queueLength={queue.length}
                  handleDragStart={handleDragStart}
                  handleDragOver={handleDragOver}
                  handleDrop={handleDrop}
                  handleDragEnd={handleDragEnd}
                  dragOverPosition={dragOverInfo && dragOverInfo.index === index ? dragOverInfo.position : null}
                  moveQueueItem={moveQueueItem}
                  playTrack={(t) => {
                    playTrack(t);
                    if (setPlayingSource) setPlayingSource({ type: 'queue' });
                  }}
                  removeFromQueue={removeFromQueue}
                />
              ))}
              
              {queue.length === 0 && (
                <div className={`empty-list-message queue ${isQueueDragOver ? 'drag-over' : ''}`}>
                  {isQueueDragOver ? '여기에 곡을 놓아 대기열에 추가' : '현재 재생 목록이 비어 있습니다.'}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── 사이드바 하단 고정 대기열 컨트롤 바 (대기열 탭이 아닐 때만 노출) ── */}
      {activeTab !== 'queue' && (
        <div 
          className={`playlist-bottom-control-bar ${isQueueDragOver ? 'drag-over' : ''}`}
          onDragOver={handleQueueDragOver}
          onDragLeave={handleQueueDragLeave}
          onDrop={handleQueueDrop}
        >
          <Button 
            variant="secondary"
            className="btn-create-playlist-bar"
            onClick={() => {
              if (setActiveSharedPlaylist) setActiveSharedPlaylist(null);
              setSelectedPlaylistId(null);
              setActiveTab('queue');
            }}
            leadingIcon={<ListMusic size={16} />}
          >
            대기열
            {queue.length > 0 && (
              <span className="queue-btn-badge">{queue.length}</span>
            )}
          </Button>
        </div>
      )}
      </div>

      {/* ── 사이드바 하단 미니 플레이어 영역 (부드러운 확장 트랜지션) ── */}
      <div className={`sidebar-miniplayer-wrapper ${currentTrack ? 'show' : ''}`}>
        <div className="sidebar-miniplayer-section">
          <div id="sidebar-miniplayer-slot" className="sidebar-miniplayer-slot">
            {displayInVinyl && (
              <div 
                className="sidebar-miniplayer-in-vinyl-msg"
                onClick={triggerReturnToVinyl}
                title="미니 플레이어로 복원"
              >
                <TvMinimal size={36} strokeWidth={1.5} />
                <span className="in-vinyl-text">플레이어에서 영상 재생 중</span>
                <span className="in-vinyl-subtext">클릭하여 사이드바 배치로 복원</span>
              </div>
            )}
          </div>
        </div>
      </div>


      {/* 플레이리스트 생성 모달 */}
      <PlaylistModal 
        isOpen={isCreateModalOpen}
        mode="create"
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreatePlaylist}
        render2x2Cover={render2x2Cover}
      />

      {/* 플레이리스트 정보 수정 모달 */}
      <PlaylistModal 
        isOpen={!!editingPlaylist}
        mode="edit"
        initialPlaylist={editingPlaylist}
        onClose={() => setEditingPlaylist(null)}
        onSubmit={handleUpdatePlaylistInfo}
        render2x2Cover={render2x2Cover}
      />
    </div>
  );
}
