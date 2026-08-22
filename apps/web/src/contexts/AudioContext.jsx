import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from "react";
import { searchYoutube } from "../utils/youtube";
import { isMatchTrack } from "../utils/trackUtils";
import { STORAGE_KEYS, getStorageItem, setStorageItem } from "../utils/audioStorage";
import { useToast } from "../hooks/useToast";
import { useAuth } from "./AuthContext";

const AudioContext = createContext(null);

export const getShuffleKey = (source) => {
  if (!source) return 'default';
  if (typeof source === 'string') return source;
  if (source.type === 'my') return `my_${source.playlistId}`;
  if (source.type === 'shared') return `shared_${source.data?.id}`;
  if (source.type === 'queue') return 'queue';
  return 'default';
};

export function AudioProvider({ children }) {
  const auth = useAuth();
  const user = auth?.user;
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // 1. 기본 오디오/플레이어 관련 상태
  const [player, setPlayer] = useState(null);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingTrack, setIsLoadingTrack] = useState(false);

  // 2. 로컬스토리지 복원 상태
  const [currentTime, setCurrentTime] = useState(() => getStorageItem(STORAGE_KEYS.CURRENT_TIME, 0));
  const [duration, setDuration] = useState(() => getStorageItem(STORAGE_KEYS.DURATION, 0));
  const [volume, setVolume] = useState(() => getStorageItem(STORAGE_KEYS.VOLUME, 80));
  const [isMuted, setIsMuted] = useState(false);

  const [playlist, setPlaylist] = useState(() => getStorageItem(STORAGE_KEYS.PLAYLIST, []));
  const [queue, setQueue] = useState(() => getStorageItem(STORAGE_KEYS.QUEUE, []));
  const [currentTrack, setCurrentTrack] = useState(() => getStorageItem(STORAGE_KEYS.CURRENT_TRACK, null));
  const [repeatMode, setRepeatMode] = useState(() => getStorageItem(STORAGE_KEYS.REPEAT_MODE, 'all'));

  const [shuffleMap, setShuffleMap] = useState(() => getStorageItem('sofar_shuffle_map', {}));
  const [sleepTimer, setSleepTimer] = useState(null);
  const [showVideoInVinyl, setShowVideoInVinyl] = useState(false);
  const [videoVinylState, setVideoVinylState] = useState("idle");
  const [isLyricsExpanded, setIsLyricsExpanded] = useState(false);
  const [isLyricsHidden, setIsLyricsHidden] = useState(() => getStorageItem('sofar_is_lyrics_hidden', false));

  useEffect(() => {
    setStorageItem('sofar_is_lyrics_hidden', isLyricsHidden);
  }, [isLyricsHidden]);

  const [playbackContext, setPlaybackContext] = useState(() => getStorageItem(STORAGE_KEYS.PLAYBACK_CONTEXT, []));
  const [activeSharedPlaylist, setActiveSharedPlaylist] = useState(null);
  const [playingSource, setPlayingSource] = useState(() => getStorageItem(STORAGE_KEYS.PLAYING_SOURCE, null));

  useEffect(() => {
    setStorageItem('sofar_shuffle_map', shuffleMap);
  }, [shuffleMap]);

  const isShuffleFor = useCallback((key) => {
    if (!key) return false;
    return !!shuffleMap[key];
  }, [shuffleMap]);

  const toggleShuffleFor = useCallback((key, value) => {
    if (!key) return;
    setShuffleMap((prev) => {
      const nextVal = value !== undefined ? !!value : !prev[key];
      return { ...prev, [key]: nextVal };
    });
  }, []);

  const currentShuffleKey = useMemo(() => {
    return getShuffleKey(playingSource);
  }, [playingSource]);

  const isShuffle = useMemo(() => {
    return !!shuffleMap[currentShuffleKey];
  }, [shuffleMap, currentShuffleKey]);

  const setIsShuffle = useCallback((val) => {
    if (!currentShuffleKey) return;
    if (typeof val === 'function') {
      setShuffleMap((prev) => {
        const currentVal = !!prev[currentShuffleKey];
        return { ...prev, [currentShuffleKey]: val(currentVal) };
      });
    } else {
      toggleShuffleFor(currentShuffleKey, val);
    }
  }, [currentShuffleKey, toggleShuffleFor]);

  // 매칭 피드백(네/아니오) 제출 이력 저장 상태 (한번이라도 선택 시 더이상 노출 안함)
  const [votedMatchVideos, setVotedMatchVideos] = useState(() => {
    try {
      const saved = localStorage.getItem('sofar_voted_match_videos');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  // 대체 음원 매칭 진행 중 로딩 상태
  const [isMatchFeedbackLoading, setIsMatchFeedbackLoading] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem('sofar_voted_match_videos', JSON.stringify(votedMatchVideos));
    } catch (e) {}
  }, [votedMatchVideos]);

  const hasVotedCurrentTrack = useMemo(() => {
    if (!currentTrack || !currentTrack.youtube_video_id) return true;
    const query = (currentTrack.searchQuery || `${currentTrack.custom_artist || ''} ${currentTrack.custom_title || ''}`).trim().toLowerCase();
    const videoId = currentTrack.youtube_video_id;
    return votedMatchVideos.includes(videoId) || votedMatchVideos.includes(`${query}::${videoId}`);
  }, [currentTrack, votedMatchVideos]);

  useEffect(() => {
    if (playingSource) {
      setStorageItem(STORAGE_KEYS.PLAYING_SOURCE, playingSource);
    }
  }, [playingSource]);

  // 3. 토스트 관리 커스텀 훅
  const { toastMessage, isToastVisible, showToast } = useToast();

  // 4. 비동기 핸들러용 Ref 동기화
  const isInitializingRef = useRef(false);
  const lastSeekTimeRef = useRef(0);
  const lastSavedTimeRef = useRef(0);
  const handlePlayerStateChangeRef = useRef(null);
  const handlePlayerErrorRef = useRef(null);
  const playNextRef = useRef(null);
  const durationRef = useRef(duration);
  const currentTrackRef = useRef(currentTrack);
  const currentTimeRef = useRef(currentTime);
  const excludedVideoIdsRef = useRef({});
  const lastFeedbackTimeRef = useRef(0);
  const matchFeedbackCountRef = useRef({});
  const playlistRef = useRef(playlist);
  const queueRef = useRef(queue);
  const playbackContextRef = useRef(playbackContext);
  const repeatModeRef = useRef(repeatMode);
  const isShuffleRef = useRef(isShuffle);
  const playerRef = useRef(player);
  const playingSourceRef = useRef(playingSource);
  const shuffleMapRef = useRef(shuffleMap);

  useEffect(() => {
    durationRef.current = duration;
    currentTrackRef.current = currentTrack;
    currentTimeRef.current = currentTime;
    playlistRef.current = playlist;
    queueRef.current = queue;
    playbackContextRef.current = playbackContext;
    repeatModeRef.current = repeatMode;
    isShuffleRef.current = isShuffle;
    playerRef.current = player;
    playingSourceRef.current = playingSource;
    shuffleMapRef.current = shuffleMap;
  }, [duration, currentTrack, currentTime, playlist, queue, playbackContext, repeatMode, isShuffle, player, playingSource, shuffleMap]);

  // 5. 로컬 스토리지 자동 영속화
  useEffect(() => {
    if (currentTrack) setStorageItem(STORAGE_KEYS.CURRENT_TRACK, currentTrack);
  }, [currentTrack]);

  useEffect(() => {
    setStorageItem(STORAGE_KEYS.PLAYLIST, playlist);
  }, [playlist]);

  useEffect(() => {
    setStorageItem(STORAGE_KEYS.QUEUE, queue);
  }, [queue]);

  useEffect(() => {
    setStorageItem(STORAGE_KEYS.PLAYBACK_CONTEXT, playbackContext);
  }, [playbackContext]);

  useEffect(() => {
    if (Math.abs(currentTime - lastSavedTimeRef.current) > 1) {
      setStorageItem(STORAGE_KEYS.CURRENT_TIME, currentTime);
      lastSavedTimeRef.current = currentTime;
    }
  }, [currentTime]);

  useEffect(() => {
    setStorageItem(STORAGE_KEYS.DURATION, duration);
  }, [duration]);

  useEffect(() => {
    setStorageItem(STORAGE_KEYS.VOLUME, volume);
  }, [volume]);

  useEffect(() => {
    setStorageItem(STORAGE_KEYS.REPEAT_MODE, repeatMode);
  }, [repeatMode]);

  // 6. 재생 컨트롤 로직 (playTrack, playNext, playPrevious 등)
  const playTrack = useCallback(async (track, contextList = null) => {
    if (!track) return;
    if (contextList && Array.isArray(contextList) && contextList.length > 0) {
      setPlaybackContext(contextList);
    }
    setCurrentTrack(track);
    setCurrentTime(0);
    setDuration(0);
    setIsLoadingTrack(true);
    setIsPlaying(true);

    let activeTrack = track;

    if (!activeTrack.youtube_video_id) {
      try {
        const query = activeTrack.searchQuery || `${activeTrack.custom_artist || ''} ${activeTrack.custom_title || ''}`;
        const results = await searchYoutube(query, activeTrack.durationSec || 0);
        if (results && results.length > 0) {
          activeTrack = {
            ...results[0],
            id: activeTrack.id || results[0].id,
            custom_title: activeTrack.custom_title,
            custom_artist: activeTrack.custom_artist,
            thumbnail: activeTrack.thumbnail || results[0].thumbnail,
            durationSec: activeTrack.durationSec || results[0].durationSec
          };
          setCurrentTrack(activeTrack);
          setQueue(prev => prev.map(t => isMatchTrack(t, track) ? activeTrack : t));
        } else {
          showToast(`'${activeTrack.custom_title}' 재생 정보를 찾을 수 없습니다.`);
          setIsLoadingTrack(false);
          setIsPlaying(false);
          setTimeout(() => {
            if (playNextRef.current) playNextRef.current();
          }, 1000);
          return;
        }
      } catch (err) {
        console.warn('Auto search youtube error in playTrack:', err);
        setIsLoadingTrack(false);
        setIsPlaying(false);
        setTimeout(() => {
          if (playNextRef.current) playNextRef.current();
        }, 1000);
        return;
      }
    }

    const p = playerRef.current || player;
    if (p && typeof p.loadVideoById === "function") {
      p.loadVideoById({
        videoId: activeTrack.youtube_video_id,
        startSeconds: 0,
      });
      p.playVideo();
    }
    hasLoggedPlayRef.current = false;
  }, [player, showToast]);

  const playNext = useCallback(() => {
    const currentQueue = queueRef.current;
    const currentPlaybackCtx = playbackContextRef.current;
    const currentPlaylist = playlistRef.current;
    const activeTrack = currentTrackRef.current;
    const activeRepeat = repeatModeRef.current;
    const currentShuffleKey = getShuffleKey(playingSourceRef.current);
    const activeShuffle = !!shuffleMapRef.current[currentShuffleKey];

    let targetList = [];
    if (currentQueue.length > 0 && activeTrack && currentQueue.some((t) => isMatchTrack(t, activeTrack))) {
      targetList = currentQueue;
    } else if (currentPlaybackCtx.length > 0 && activeTrack && currentPlaybackCtx.some((t) => isMatchTrack(t, activeTrack))) {
      targetList = currentPlaybackCtx;
    } else if (currentPlaylist.length > 0 && activeTrack && currentPlaylist.some((t) => isMatchTrack(t, activeTrack))) {
      targetList = currentPlaylist;
    } else if (currentPlaybackCtx.length > 0) {
      targetList = currentPlaybackCtx;
    } else if (currentPlaylist.length > 0) {
      targetList = currentPlaylist;
    }

    if (targetList.length > 0) {
      if (activeShuffle && targetList.length > 1) {
        const remainingTracks = targetList.filter((t) => !activeTrack || !isMatchTrack(t, activeTrack));
        const randomIndex = Math.floor(Math.random() * remainingTracks.length);
        playTrack(remainingTracks[randomIndex]);
        return;
      }

      const currentIdx = activeTrack ? targetList.findIndex((t) => isMatchTrack(t, activeTrack)) : -1;
      if (currentIdx !== -1 && currentIdx < targetList.length - 1) {
        playTrack(targetList[currentIdx + 1]);
        return;
      }
      if (activeRepeat === "all") {
        playTrack(targetList[0]);
        return;
      }
    }

    setIsPlaying(false);
  }, [playTrack]);

  useEffect(() => {
    playNextRef.current = playNext;
  }, [playNext]);

  const playPrevious = useCallback(() => {
    const currentQueue = queueRef.current;
    const currentPlaybackCtx = playbackContextRef.current;
    const currentPlaylist = playlistRef.current;
    const activeTrack = currentTrackRef.current;
    const activeRepeat = repeatModeRef.current;
    const currentShuffleKey = getShuffleKey(playingSourceRef.current);
    const activeShuffle = !!shuffleMapRef.current[currentShuffleKey];

    let targetList = [];
    if (currentQueue.length > 0 && activeTrack && currentQueue.some((t) => isMatchTrack(t, activeTrack))) {
      targetList = currentQueue;
    } else if (currentPlaybackCtx.length > 0 && activeTrack && currentPlaybackCtx.some((t) => isMatchTrack(t, activeTrack))) {
      targetList = currentPlaybackCtx;
    } else if (currentPlaylist.length > 0 && activeTrack && currentPlaylist.some((t) => isMatchTrack(t, activeTrack))) {
      targetList = currentPlaylist;
    } else if (currentPlaybackCtx.length > 0) {
      targetList = currentPlaybackCtx;
    } else if (currentPlaylist.length > 0) {
      targetList = currentPlaylist;
    }

    if (targetList.length > 0) {
      if (activeShuffle && targetList.length > 1) {
        const remainingTracks = targetList.filter((t) => !activeTrack || !isMatchTrack(t, activeTrack));
        const randomIndex = Math.floor(Math.random() * remainingTracks.length);
        playTrack(remainingTracks[randomIndex]);
        return;
      }

      const currentIdx = activeTrack ? targetList.findIndex((t) => isMatchTrack(t, activeTrack)) : -1;
      if (currentIdx > 0) {
        playTrack(targetList[currentIdx - 1]);
        return;
      }
      if (activeRepeat === "all") {
        playTrack(targetList[targetList.length - 1]);
        return;
      }
      if (targetList.length > 0) {
        playTrack(targetList[0]);
        return;
      }
    }
  }, [playTrack]);

  const handleTrackEnded = useCallback(() => {
    if (repeatModeRef.current === "one") {
      const p = playerRef.current;
      if (p && typeof p.seekTo === "function" && typeof p.playVideo === "function") {
        p.seekTo(0, true);
        p.playVideo();
        setIsPlaying(true);
      }
    } else {
      playNext();
    }
  }, [playNext]);

  const handlePlayerStateChange = useCallback((event) => {
    if (!window.YT) return;
    if (event.data === window.YT.PlayerState.PLAYING) {
      setIsPlaying(true);
      setIsLoadingTrack(false);
      if (event.target && typeof event.target.getDuration === "function") {
        const d = event.target.getDuration();
        if (d && !isNaN(d) && d > 0) {
          setDuration(d);
        }
      }
    } else if (event.data === window.YT.PlayerState.PAUSED) {
      setIsPlaying(false);
    } else if (event.data === window.YT.PlayerState.ENDED) {
      setIsPlaying(false);
      handleTrackEnded();
    }
  }, [handleTrackEnded]);

  const handlePlayerError = useCallback((event) => {
    console.error("YouTube Player Error:", event.data);
    showToast("재생할 수 없는 영상입니다. 다음 곡으로 이동합니다.");
    setTimeout(() => {
      playNext();
    }, 2000);
  }, [playNext, showToast]);

  useEffect(() => {
    handlePlayerStateChangeRef.current = handlePlayerStateChange;
    handlePlayerErrorRef.current = handlePlayerError;
  }, [handlePlayerStateChange, handlePlayerError]);

  useEffect(() => {
    if (window.YT && window.YT.Player) {
      setIsPlayerReady(true);
      return;
    }
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName("script")[0];
    if (firstScriptTag && firstScriptTag.parentNode) {
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }
    window.onYouTubeIframeAPIReady = () => {
      setIsPlayerReady(true);
    };
  }, []);

  const initPlayer = useCallback((elementId) => {
    if (!window.YT || !window.YT.Player || player || isInitializingRef.current) return;
    isInitializingRef.current = true;

    new window.YT.Player(elementId, {
      height: "100%",
      width: "100%",
      videoId: "",
      playerVars: {
        playsinline: 1,
        controls: 0,
        disablekb: 1,
        rel: 0,
        modestbranding: 1,
        origin: window.location.origin,
      },
      events: {
        onReady: (event) => {
          setPlayer(event.target);
          event.target.setVolume(volume);
          isInitializingRef.current = false;

          try {
            const savedTrack = getStorageItem(STORAGE_KEYS.CURRENT_TRACK, null);
            const savedTime = getStorageItem(STORAGE_KEYS.CURRENT_TIME, 0);
            if (savedTrack && savedTrack.youtube_video_id && event.target.cueVideoById) {
              event.target.cueVideoById({
                videoId: savedTrack.youtube_video_id,
                startSeconds: savedTime
              });
            }
          } catch (e) {
            console.warn('Failed to cue initial video onReady:', e);
          }
        },
        onStateChange: (event) => {
          if (handlePlayerStateChangeRef.current) {
            handlePlayerStateChangeRef.current(event);
          }
        },
        onError: (event) => {
          if (handlePlayerErrorRef.current) {
            handlePlayerErrorRef.current(event);
          }
        },
      },
    });
  }, [player, volume]);

  const hasLoggedPlayRef = useRef(false);

  useEffect(() => {
    let interval;
    if (player && typeof player.getCurrentTime === "function") {
      interval = setInterval(() => {
        if (Date.now() - lastSeekTimeRef.current < 500) return;
        try {
          const playerState = typeof player.getPlayerState === "function" ? player.getPlayerState() : -1;
          if (playerState === 1) {
            setIsPlaying(true);
            setIsLoadingTrack(false);
            const t = player.getCurrentTime();
            if (typeof t === "number" && !isNaN(t) && t >= 0) {
              setCurrentTime(t);
            }
            const trackDuration = player.getDuration();
            if (trackDuration && typeof trackDuration === "number" && !isNaN(trackDuration) && trackDuration > 0) {
              setDuration(trackDuration);
            }

            // 30초 이상 연속 감상 시 1회 백엔드로 유효 스트리밍 로그(Valid Stream) 전송 (Melon/Spotify 어뷰징 방지 표준)
            const activeTr = currentTrackRef.current;
            if (!hasLoggedPlayRef.current && activeTr && typeof t === "number" && t >= 30) {
              hasLoggedPlayRef.current = true;
              try {
                const getOrCreateClientId = () => {
                  try {
                    let id = localStorage.getItem('sofar_client_id');
                    if (!id) {
                      id = 'cli_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
                      localStorage.setItem('sofar_client_id', id);
                    }
                    return id;
                  } catch (e) {
                    return 'cli_anon_' + Date.now();
                  }
                };

                const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
                fetch(`${backendUrl}/api/chart/play-log`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    custom_title: activeTr.custom_title,
                    custom_artist: activeTr.custom_artist,
                    searchQuery: activeTr.searchQuery,
                    youtube_video_id: activeTr.youtube_video_id,
                    playedSec: Math.floor(t),
                    clientId: getOrCreateClientId(),
                  }),
                }).catch(() => {});
              } catch (e) {}
            }
          } else if (playerState === 2) {
            const t = player.getCurrentTime();
            if (typeof t === "number" && !isNaN(t) && t >= 0) {
              setCurrentTime(t);
            }
          }
        } catch (e) {
          // Catch
        }
      }, 200);
    }
    return () => clearInterval(interval);
  }, [player]);

  const togglePlay = useCallback(() => {
    if (!player) return;
    if (isPlaying) {
      player.pauseVideo();
      setIsPlaying(false);
    } else {
      if (!currentTrack) {
        if (queue.length > 0) {
          playTrack(queue[0]);
        } else if (playlist.length > 0) {
          playTrack(playlist[0]);
        }
      } else {
        player.playVideo();
        setIsPlaying(true);
      }
    }
  }, [player, isPlaying, currentTrack, queue, playlist, playTrack]);

  const seekTo = useCallback((seconds) => {
    if (player && typeof player.seekTo === "function") {
      lastSeekTimeRef.current = Date.now();
      player.seekTo(seconds, true);
      setCurrentTime(seconds);
    }
  }, [player]);

  const changeVolume = useCallback((val) => {
    setVolume(val);
    if (val > 0) setIsMuted(false);
    if (player && typeof player.setVolume === "function") {
      player.setVolume(val);
    }
  }, [player]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (player && typeof player.setVolume === "function") {
        player.setVolume(next ? 0 : volume);
      }
      return next;
    });
  }, [player, volume]);

  const triggerReturnToVinyl = useCallback(() => {
    if (videoVinylState !== 'video') return;
    setVideoVinylState('hiding-video');
    setTimeout(() => {
      setShowVideoInVinyl(false);
      setVideoVinylState('idle');
    }, 300);
  }, [videoVinylState]);

  const [openModalCount, setOpenModalCount] = useState(0);

  const registerModalOpen = useCallback(() => {
    setOpenModalCount((prev) => prev + 1);
  }, []);

  const registerModalClose = useCallback(() => {
    setOpenModalCount((prev) => Math.max(0, prev - 1));
  }, []);

  // 전역 모달창 열림/닫힘 이벤트 감지 리스너
  useEffect(() => {
    const handleModalOpen = () => {
      setOpenModalCount((prev) => prev + 1);
    };
    const handleModalClose = () => {
      setOpenModalCount((prev) => Math.max(0, prev - 1));
    };

    window.addEventListener('sofar:modal-open', handleModalOpen);
    window.addEventListener('sofar:modal-close', handleModalClose);

    return () => {
      window.removeEventListener('sofar:modal-open', handleModalOpen);
      window.removeEventListener('sofar:modal-close', handleModalClose);
    };
  }, []);

  // 모달창이 켜지면 비디오 플레이어가 사이드 패널 배치로 자동 복귀
  useEffect(() => {
    if (openModalCount > 0 && (showVideoInVinyl || videoVinylState !== 'idle')) {
      if (videoVinylState === 'video') {
        triggerReturnToVinyl();
      } else {
        setShowVideoInVinyl(false);
        setVideoVinylState('idle');
      }
    }
  }, [openModalCount, showVideoInVinyl, videoVinylState, triggerReturnToVinyl]);

  const updateTrackMetadata = useCallback((trackId, updates) => {
    setCurrentTrack((prev) => (prev && prev.id === trackId ? { ...prev, ...updates } : prev));
    setPlaylist((prev) => prev.map((t) => (t.id === trackId ? { ...t, ...updates } : t)));
    setQueue((prev) => prev.map((t) => (t.id === trackId ? { ...t, ...updates } : t)));
  }, []);

  const toggleShuffle = useCallback(() => {
    setIsShuffle((prev) => !prev);
  }, []);

  const openQueueInSidebar = useCallback(() => {
    window.dispatchEvent(new CustomEvent('trigger-open-queue'));
  }, []);

  const addToQueue = useCallback((trackOrTracks, position = 'end', options = {}) => {
    if (!trackOrTracks) return;
    const isArray = Array.isArray(trackOrTracks);
    const tracksToAdd = isArray ? trackOrTracks.filter(Boolean) : [trackOrTracks];
    if (tracksToAdd.length === 0) return;

    setQueue((prevQueue) => {
      let updatedQueue = [...prevQueue];

      // 기존 큐에서 추가하려는 트랙들과 매칭되는 항목들 제거 (중복 방지)
      tracksToAdd.forEach((newTrack) => {
        const existingIndex = updatedQueue.findIndex(t => isMatchTrack(t, newTrack));
        if (existingIndex !== -1) {
          updatedQueue.splice(existingIndex, 1);
        }
      });

      if (position === 'next') {
        if (currentTrackRef.current) {
          const currentIndex = updatedQueue.findIndex(t => isMatchTrack(t, currentTrackRef.current));
          if (currentIndex !== -1) {
            updatedQueue.splice(currentIndex + 1, 0, ...tracksToAdd);
          } else {
            updatedQueue.unshift(...tracksToAdd);
          }
        } else {
          updatedQueue.unshift(...tracksToAdd);
        }
      } else {
        updatedQueue.push(...tracksToAdd);
      }

      return updatedQueue;
    });

    if (!options?.noOpenQueue) {
      window.dispatchEvent(new CustomEvent('trigger-open-queue'));
    }

    if (!options?.silent) {
      if (isArray) {
        if (tracksToAdd.length === 1) {
          const single = tracksToAdd[0];
          const posText = position === 'next' ? '다음에 재생하도록 대기열에' : '대기열 맨 뒤에';
          showToast(`'${single.custom_title || single.title || '트랙'}'을(를) ${posText} 추가했습니다.`);
        } else {
          const posText = position === 'next' ? '다음에 재생하도록 대기열에' : '대기열에';
          showToast(`음악 ${tracksToAdd.length}곡을 ${posText} 추가했습니다.`);
        }
      } else {
        const posText = position === 'next' ? '다음에 재생하도록 대기열에' : '대기열 맨 뒤에';
        showToast(`'${trackOrTracks.custom_title || trackOrTracks.title || '트랙'}'을(를) ${posText} 추가했습니다.`);
      }
    }
  }, [showToast]);

  // 트랙 매칭 피드백 기록 및 즉각 대체 음원 자동 전환 (어뷰징 방지 대책 및 지속적 평가 팝업 노출 포함)
  const reportMatchFeedback = useCallback(async (isCorrect) => {
    const activeTrack = currentTrackRef.current;
    if (!activeTrack || !activeTrack.youtube_video_id) return;

    // 1. 어뷰징 방지: 이미 대체 음원 탐색 중이면 추가 클릭 무시
    if (isMatchFeedbackLoading) return;

    // 2. 어뷰징 방지: 클릭 간격 쿨다운 (최소 1.5초)
    const now = Date.now();
    if (now - lastFeedbackTimeRef.current < 1500) {
      showToast('잠시 후 다시 시도해주세요.');
      return;
    }
    lastFeedbackTimeRef.current = now;

    const query = activeTrack.searchQuery || `${activeTrack.custom_artist || ''} ${activeTrack.custom_title || ''}`;
    const videoId = activeTrack.youtube_video_id;
    const trackKey = activeTrack.id || query.trim().toLowerCase();

    // 로그인 회원인 경우에만 백엔드 서버(DB 캐시 갱신 및 패널티/어드민 신고)로 피드백 전송
    const currentUser = userRef.current;
    const isGuest = !currentUser || Boolean(currentUser.isGuest);

    if (!isGuest && currentUser?.id) {
      const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      try {
        fetch(`${backendUrl}/api/chart/match-feedback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            searchQuery: query,
            youtube_video_id: videoId,
            isCorrect,
            custom_title: activeTrack.custom_title,
            custom_artist: activeTrack.custom_artist,
            artwork: activeTrack.artwork || activeTrack.cover || activeTrack.thumbnail || '',
            userId: currentUser.id,
            isGuest: false,
          }),
        }).catch(() => {});
      } catch (e) {}
    }

    // '예' 선택 시: 해당 비디오 ID 확인 처리 -> votedMatchVideos 기록 -> 팝업 완료 닫힘
    if (isCorrect) {
      setVotedMatchVideos(prev => Array.from(new Set([...prev, videoId, `${query.trim().toLowerCase()}::${videoId}`])));
      showToast(isGuest ? '원곡 매칭이 확인되었습니다.' : '원곡 매칭 의견이 서버에 반영되었습니다. 감사합니다!');
      return;
    }

    // '아니요' 선택 시:
    // 3. 어뷰징 방지: 연속 '아니요' 횟수 제한 (한 트랙당 최대 5회)
    const currentNoCount = (matchFeedbackCountRef.current[trackKey] || 0) + 1;
    matchFeedbackCountRef.current[trackKey] = currentNoCount;

    if (currentNoCount > 5) {
      setVotedMatchVideos(prev => Array.from(new Set([...prev, videoId, `${query.trim().toLowerCase()}::${videoId}`])));
      showToast('최대 대체 탐색 횟수(5회)에 도달하였습니다.');
      return;
    }

    // 이전에 이 트랙에 대해 제외한 비디오 ID 목록 누적
    if (!excludedVideoIdsRef.current[trackKey]) {
      excludedVideoIdsRef.current[trackKey] = new Set();
    }
    excludedVideoIdsRef.current[trackKey].add(videoId);

    const excludeList = Array.from(excludedVideoIdsRef.current[trackKey]);

    // 현재 제외된 비디오 ID만 제출 목록에 저장 (새 비디오 ID는 저장하지 않아 팝업이 지속 노출됨)
    setVotedMatchVideos(prev => Array.from(new Set([...prev, videoId])));

    setIsMatchFeedbackLoading(true);
    showToast('다른 원곡 음원 영상으로 즉시 탐색 중...');

    try {
      const results = await searchYoutube(query, activeTrack.durationSec || 0, excludeList);

      // 탐색 도중 사용자가 완전히 다른 트랙으로 변경한 경우 처리 중단
      if (currentTrackRef.current?.id !== activeTrack.id && currentTrackRef.current?.youtube_video_id !== activeTrack.youtube_video_id) {
        setIsMatchFeedbackLoading(false);
        return;
      }

      if (results && results.length > 0) {
        const nextCandidate = results[0];
        const updatedTrack = {
          ...activeTrack,
          youtube_video_id: nextCandidate.youtube_video_id,
          durationSec: nextCandidate.durationSec || activeTrack.durationSec,
        };

        // 1) Context 상태 및 큐/플레이리스트 동기화
        setCurrentTrack(updatedTrack);
        setQueue(prev => prev.map(t => isMatchTrack(t, activeTrack) ? updatedTrack : t));
        setPlaylist(prev => prev.map(t => isMatchTrack(t, activeTrack) ? updatedTrack : t));

        // 2) 플레이어 세션 즉각 교체 재생 (현재 시간대 유지)
        const p = playerRef.current || player;
        if (p && typeof p.loadVideoById === "function") {
          const currentSec = currentTimeRef.current || 0;
          p.loadVideoById({
            videoId: nextCandidate.youtube_video_id,
            startSeconds: currentSec > 5 ? currentSec : 0,
          });
          if (typeof p.playVideo === "function") {
            p.playVideo();
          }
          setIsPlaying(true);
        }

        showToast(`다음 우선순위 영상으로 즉시 교체되었습니다. (${currentNoCount}/5)`);
      } else {
        setVotedMatchVideos(prev => Array.from(new Set([...prev, videoId, `${query.trim().toLowerCase()}::${videoId}`])));
        showToast('대체할 다른 유튜브 음원 영상을 찾을 수 없습니다.');
      }
    } catch (err) {
      console.warn('Failed to switch to alternative video candidate:', err);
      showToast('대체 음원 탐색 중 오류가 발생했습니다.');
    } finally {
      setIsMatchFeedbackLoading(false);
    }
  }, [player, showToast, isMatchFeedbackLoading]);

  const value = {
    player,
    isPlayerReady,
    isPlaying,
    setIsPlaying,
    isLoadingTrack,
    currentTime,
    setCurrentTime,
    duration,
    setDuration,
    volume,
    setVolume,
    isMuted,
    setIsMuted,
    playlist,
    setPlaylist,
    queue,
    setQueue,
    addToQueue,
    openQueueInSidebar,
    currentTrack,
    setCurrentTrack,
    repeatMode,
    setRepeatMode,
    isShuffle,
    setIsShuffle,
    toggleShuffle,
    shuffleMap,
    isShuffleFor,
    toggleShuffleFor,
    sleepTimer,
    setSleepTimer,
    toastMessage,
    isToastVisible,
    showToast,
    reportMatchFeedback,
    hasVotedCurrentTrack,
    isMatchFeedbackLoading,
    initPlayer,
    playTrack,
    togglePlay,
    playNext,
    playPrevious,
    seekTo,
    changeVolume,
    toggleMute,
    showVideoInVinyl,
    setShowVideoInVinyl,
    videoVinylState,
    setVideoVinylState,
    triggerReturnToVinyl,
    isLyricsExpanded,
    setIsLyricsExpanded,
    isLyricsHidden,
    setIsLyricsHidden,
    toggleLyricsHidden: () => setIsLyricsHidden(prev => !prev),
    updateTrackMetadata,
    activeSharedPlaylist,
    setActiveSharedPlaylist,
    playingSource,
    setPlayingSource,
    registerModalOpen,
    registerModalClose,
    isModalOpen: openModalCount > 0,
    isTrackCurrent: (track) => isMatchTrack(track, currentTrack),
  };

  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
}

export function useAudio() {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error("useAudio must be used within an AudioProvider");
  }
  return context;
}
