import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Play, Pause, SkipForward, SkipBack, 
  Repeat, Repeat1, Shuffle, 
  Heart, ListPlus, FolderPlus, ListMusic,
  ClockPlus,
  ThumbsUp,
  ThumbsDown,
  Check,
  Moon
} from 'lucide-react';
import { useAudio } from '../../contexts/AudioContext';
import { useFavorite } from '../../contexts/FavoriteContext';
import { useAuth, supabase } from '../../contexts/AuthContext';
import { useNowPlaying } from '../../hooks/useNowPlaying';
import { useAddTrackToPlaylist } from '../../hooks/useTracks';
import VolumePopover from './VolumePopover';
import { thumbnailCache } from '../../utils/thumbnailCache';
import { formatArtistName } from '../../utils/trackUtils';
import { Modal, Button, Input, Dropdown } from '../ui';
import './Player.css';

function formatTime(seconds) {
  if (isNaN(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export default function Player() {
  const { navigateToNowPlaying } = useNowPlaying();
  const navigate = useNavigate();
  const location = useLocation();
  const isNowPlayingPage = location.pathname === '/now' || location.pathname === '/now-playing';
  const {
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    currentTrack,
    repeatMode,
    setRepeatMode,
    isShuffle,
    setIsShuffle,
    sleepTimer,
    setSleepTimer,
    togglePlay,
    playPrevious,
    playNext,
    seekTo,
    changeVolume,
    toggleMute,
    playlist,
    setPlaylist,
    queue,
    setQueue,
    addToQueue,
    showToast,
    reportMatchFeedback
  } = useAudio();

  const { user } = useAuth();

  const [playlists, setPlaylists] = useState([]);
  const [imgFallbackLevel, setImgFallbackLevel] = useState(0); // 0: maxres, 1: hq, 2: default/unsplash
  const [itunesThumbnailUrl, setItunesThumbnailUrl] = useState(null);

  const titleContainerRef = useRef(null);
  const titleTextRef = useRef(null);
  const titleInnerRef = useRef(null);
  const [isTitleOverflowing, setIsTitleOverflowing] = useState(false);
  const [overflowWidth, setOverflowWidth] = useState(0);

  // Check title text overflow for marquee animation
  useEffect(() => {
    const checkOverflow = () => {
      if (titleContainerRef.current && titleInnerRef.current) {
        const containerWidth = titleContainerRef.current.clientWidth;
        const textWidth = titleInnerRef.current.offsetWidth;
        if (textWidth > containerWidth) {
          setIsTitleOverflowing(true);
          setOverflowWidth(textWidth - containerWidth);
        } else {
          setIsTitleOverflowing(false);
          setOverflowWidth(0);
        }
      }
    };
    
    checkOverflow();
    window.addEventListener('resize', checkOverflow);
    const timer = setTimeout(checkOverflow, 200);
    
    return () => {
      window.removeEventListener('resize', checkOverflow);
      clearTimeout(timer);
    };
  }, [currentTrack]);

  const { isFavorite, toggleFavorite } = useFavorite();
  const favorited = currentTrack ? isFavorite(currentTrack.id) : false;

  const loadUserPlaylists = async () => {
    const sp = (user && !user.isGuest && supabase);
    if (sp) {
      const { data } = await supabase
        .from('playlists')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });
      setPlaylists(data || []);
    } else {
      const localPl = localStorage.getItem('sofar_playlists');
      setPlaylists(localPl ? JSON.parse(localPl) : []);
    }
  };

  useEffect(() => {
    loadUserPlaylists();
  }, [user]);

  const handleAddToQueue = () => {
    if (!currentTrack) return;
    addToQueue(currentTrack, 'end');
  };

  const { addTrackToPlaylist } = useAddTrackToPlaylist();

  const handleAddToPlaylist = async (targetPlaylist) => {
    if (!currentTrack || !targetPlaylist) return;
    const res = await addTrackToPlaylist(currentTrack, targetPlaylist);
    if (res.success && res.data) {
      if (playlist.length > 0 && playlist[0].playlist_id === targetPlaylist.id) {
        setPlaylist(prev => [...prev, res.data]);
      }
    }
  };

  // 앨범 이미지 URL 구하기
  const getThumbnailUrl = () => {
    if (itunesThumbnailUrl) {
      return itunesThumbnailUrl;
    }
    if (currentTrack) {
      const cached = thumbnailCache.get(currentTrack.custom_artist, currentTrack.custom_title);
      if (cached) return cached;
    }
    if (currentTrack?.youtube_video_id) {
      if (imgFallbackLevel === 0) {
        return `https://img.youtube.com/vi/${currentTrack.youtube_video_id}/maxresdefault.jpg`;
      }
      if (imgFallbackLevel === 1) {
        return `https://img.youtube.com/vi/${currentTrack.youtube_video_id}/hqdefault.jpg`;
      }
    }
    return 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=80&h=80&q=80';
  };

  // 키보드 단축키를 위한 최신 상태 및 함수 저장용 Ref (이벤트 리스너의 잦은 재생성 방지)
  const currentTrackRef = useRef(currentTrack);
  const currentTimeRef = useRef(currentTime);
  const durationRef = useRef(duration);
  const volumeRef = useRef(volume);
  const togglePlayRef = useRef(togglePlay);
  const changeVolumeRef = useRef(changeVolume);
  const seekToRef = useRef(seekTo);
  const showToastRef = useRef(showToast);

  useEffect(() => {
    currentTrackRef.current = currentTrack;
    currentTimeRef.current = currentTime;
    durationRef.current = duration;
    volumeRef.current = volume;
    togglePlayRef.current = togglePlay;
    changeVolumeRef.current = changeVolume;
    seekToRef.current = seekTo;
    showToastRef.current = showToast;
  }, [currentTrack, currentTime, duration, volume, togglePlay, changeVolume, seekTo, showToast]);

  useEffect(() => {
    const isTextInput = (el) => {
      if (!el) return false;
      const tagName = el.tagName.toLowerCase();
      if (tagName === 'textarea') return true;
      if (tagName === 'input') {
        const type = el.type ? el.type.toLowerCase() : 'text';
        const nonTextTypes = ['button', 'checkbox', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'];
        return !nonTextTypes.includes(type);
      }
      if (el.isContentEditable) return true;
      return false;
    };

    const handleKeyDown = (e) => {
      // 텍스트 입력창 또는 내용 편집 가능 영역이 활성화되어 있을 때는 단축키 작동 차단
      if (isTextInput(document.activeElement)) {
        return;
      }

      // 재생 중인 곡이 없을 때는 단축키 작동 차단
      if (!currentTrackRef.current) {
        return;
      }

      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlayRef.current();
          break;
        case 'ArrowUp':
          e.preventDefault();
          const newVolUp = Math.min(100, volumeRef.current + 10);
          changeVolumeRef.current(newVolUp);
          showToastRef.current(`볼륨: ${newVolUp}%`);
          break;
        case 'ArrowDown':
          e.preventDefault();
          const newVolDown = Math.max(0, volumeRef.current - 10);
          changeVolumeRef.current(newVolDown);
          showToastRef.current(`볼륨: ${newVolDown}%`);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          const newTimeLeft = Math.max(0, currentTimeRef.current - 5);
          seekToRef.current(newTimeLeft);
          showToastRef.current('5초 뒤로');
          break;
        case 'ArrowRight':
          e.preventDefault();
          const limitTime = durationRef.current || 100;
          const newTimeRight = Math.min(limitTime, currentTimeRef.current + 5);
          seekToRef.current(newTimeRight);
          showToastRef.current('5초 앞으로');
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    setImgFallbackLevel(0);
    setItunesThumbnailUrl(null);

    if (!currentTrack || !currentTrack.custom_title) {
      return;
    }

    const cachedUrl = thumbnailCache.get(currentTrack.custom_artist, currentTrack.custom_title);
    if (cachedUrl) {
      setItunesThumbnailUrl(cachedUrl);
      return;
    }

    let active = true;
    const fetchItunesThumbnail = async () => {
      try {
        const hasEnv = import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY;
        if (hasEnv) {
          try {
            const { supabase } = await import('../../contexts/AuthContext');
            if (supabase) {
              const { data, error } = await supabase
                .from('lyric_caches')
                .select('raw_lrc')
                .eq('artist', currentTrack.custom_artist?.trim() || '')
                .eq('title', currentTrack.custom_title?.trim() || '')
                .maybeSingle();

              if (!error && data && data.raw_lrc && active) {
                const artworkMatch = data.raw_lrc.match(/^\[artwork:(https?:\/\/[^\]]+)\]/);
                if (artworkMatch) {
                  const artworkUrl = artworkMatch[1];
                  thumbnailCache.set(currentTrack.custom_artist, currentTrack.custom_title, artworkUrl);
                  setItunesThumbnailUrl(artworkUrl);
                  return;
                }
              }
            }
          } catch (dbErr) {
            console.warn('Failed to query album art from DB:', dbErr);
          }
        }

        const query = `${currentTrack.custom_title} ${currentTrack.custom_artist || ''}`.trim();
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=1&country=kr`;
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          if (active && data.results && data.results.length > 0) {
            const artworkUrl = data.results[0].artworkUrl100;
            if (artworkUrl) {
              const highResArtwork = artworkUrl.replace(/\/[0-9]+x[0-9]+/, '/600x600');
              thumbnailCache.set(currentTrack.custom_artist, currentTrack.custom_title, highResArtwork);
              setItunesThumbnailUrl(highResArtwork);
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch iTunes thumbnail:', err);
      }
    };

    fetchItunesThumbnail();

    return () => {
      active = false;
    };
  }, [currentTrack]);

  const handleImageError = () => {
    if (itunesThumbnailUrl) {
      setItunesThumbnailUrl(null);
    } else if (imgFallbackLevel < 2) {
      setImgFallbackLevel(prev => prev + 1);
    }
  };

  const handleImageLoad = (e) => {
    const img = e.target;
    if (!itunesThumbnailUrl && img.naturalWidth === 120 && img.naturalHeight === 90) {
      handleImageError();
    }
  };

  const [isSeeking, setIsSeeking] = useState(false);
  const [seekingValue, setSeekingValue] = useState(0);

  const handleSliderPointerDown = (e) => {
    setIsSeeking(true);
    setSeekingValue(parseFloat(e.target.value));
  };

  const handleSliderInput = (e) => {
    setSeekingValue(parseFloat(e.target.value));
  };

  const handleSliderPointerUp = (e) => {
    const targetTime = parseFloat(e.target.value);
    seekTo(targetTime);
    setTimeout(() => {
      setIsSeeking(false);
    }, 200);
  };

  const handleSleepTimerOption = (mins) => {
    setSleepTimer(mins);
  };

  const handleCustomSleepTimer = (close) => {
    const input = prompt('수면 예약할 시간(분 단위)을 입력해 주세요:', '45');
    if (input !== null) {
      const mins = parseInt(input, 10);
      if (!isNaN(mins) && mins > 0) {
        setSleepTimer(mins);
        if (close) close();
      } else {
        alert('올바른 숫자를 입력해 주세요.');
      }
    }
  };

  const formatSleepTime = (seconds) => {
    if (!seconds) return '';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const displayTime = isSeeking ? seekingValue : currentTime;
  const progressPercent = duration ? (displayTime / duration) * 100 : 0;

  if (!currentTrack && !isNowPlayingPage) {
    return null;
  }

  return (
    <div className="bottom-player-bar">
      {/* 1. 좌측 영역: 곡 정보 및 즐겨찾기 */}
      <div className="bottom-player-left">
        {currentTrack ? (
          <>
            <div 
              className="bottom-player-info" 
              key={currentTrack?.id || 'empty'}
              onClick={navigateToNowPlaying}
              title="NOW PLAYING"
            >
              <div className="bottom-player-thumbnail">
                <img 
                  key={getThumbnailUrl()}
                  src={getThumbnailUrl()} 
                  onLoad={handleImageLoad}
                  onError={handleImageError}
                  alt="Thumbnail" 
                  className="bottom-thumbnail-img"
                />
              </div>
              <div className="bottom-player-meta">
                <div className="bottom-title-row">
                  <div className={`bottom-track-title-container ${isTitleOverflowing ? 'has-marquee' : ''}`} ref={titleContainerRef}>
                    <div 
                      ref={titleTextRef}
                      className={`bottom-track-title ${isTitleOverflowing ? 'animate-marquee' : ''}`}
                      title={currentTrack.custom_title}
                    >
                      <span ref={titleInnerRef}>{currentTrack.custom_title || '제목 없음'}</span>
                      {isTitleOverflowing && (
                        <span className="marquee-duplicate">{currentTrack.custom_title || '제목 없음'}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="bottom-track-artist" title={formatArtistName(currentTrack.custom_artist)}>
                  {formatArtistName(currentTrack.custom_artist) || '아티스트 없음'}
                </div>
              </div>
            </div>
            <div className="bottom-player-actions">
              <button
                onClick={() => toggleFavorite(currentTrack)}
                className={`playback-btn favorite-btn ${favorited ? 'favorited' : ''}`}
                title={favorited ? '즐겨찾기 해제' : '즐겨찾기 추가'}
              >
                <Heart size={24} strokeWidth={1.5} fill={favorited ? 'currentColor' : 'none'} />
              </button>
            </div>
          </>
        ) : (
          <div className="bottom-player-empty">
            재생 중인 곡 없음
          </div>
        )}
      </div>

      {/* 2. 중앙 영역: 재생 컨트롤 & 타임라인 슬라이더 */}
      <div className="bottom-player-center">
        {/* 컨트롤 버튼 로우 */}
        <div className="bottom-controls-row">
          <button 
            onClick={() => setIsShuffle(!isShuffle)}
            className={`bottom-meta-btn ${isShuffle ? 'active' : ''}`}
            title={isShuffle ? '셔플 재생 켬' : '셔플 재생 끔'}
            disabled={!currentTrack}
          >
            <Shuffle size={16} />
          </button>

          <button 
            onClick={playPrevious}
            disabled={!currentTrack}
            className="playback-btn"
            title="이전 곡"
          >
            <SkipBack size={18} />
          </button>

          <button 
            onClick={togglePlay}
            disabled={!currentTrack}
            className="playback-play-btn"
            title={isPlaying ? '일시정지' : '재생'}
          >
            {isPlaying ? <Pause size={20} strokeWidth={1} fill="currentColor" /> : <Play size={20} strokeWidth={1} className="play-icon-svg" fill="currentColor" />}
          </button>

          <button 
            onClick={playNext}
            disabled={!currentTrack}
            className="playback-btn"
            title="다음 곡"
          >
            <SkipForward size={18} />
          </button>

          <button 
            onClick={() => {
              if (repeatMode === 'none') setRepeatMode('all');
              else if (repeatMode === 'all') setRepeatMode('one');
              else setRepeatMode('none');
            }}
            className={`bottom-meta-btn ${repeatMode !== 'none' ? 'active' : ''}`}
            title={repeatMode === 'one' ? '한곡 반복 재생 중' : repeatMode === 'all' ? '전체 반복 재생 중' : '반복 재생 안함'}
            disabled={!currentTrack}
          >
            {repeatMode === 'one' ? <Repeat1 size={16} /> : <Repeat size={16} />}
          </button>
        </div>

        {/* 타임라인 슬라이더 로우 */}
        <div className="bottom-timeline-row">
          <span className="time-display">{formatTime(displayTime)}</span>
          <input 
            type="range"
            min="0"
            max={duration || 100}
            step="0.1"
            value={displayTime}
            onPointerDown={handleSliderPointerDown}
            onMouseDown={handleSliderPointerDown}
            onTouchStart={handleSliderPointerDown}
            onInput={handleSliderInput}
            onChange={handleSliderInput}
            onPointerUp={handleSliderPointerUp}
            onMouseUp={handleSliderPointerUp}
            onTouchEnd={handleSliderPointerUp}
            disabled={!currentTrack || duration === 0}
            className="bottom-timeline-slider"
            style={{
              background: `linear-gradient(to right, var(--primary-warm) 0%, var(--primary-warm) ${Math.min(100, Math.max(0, progressPercent))}%, #c0b5ad4f ${Math.min(100, Math.max(0, progressPercent))}%, #c0b5ad4f 100%)`
            }}
          />
          <span className="time-display">{formatTime(duration)}</span>
        </div>
      </div>

      {/* 3. 우측 영역: 볼륨 및 부가 제어 (수면 예약 타이머 등) */}
      <div className="bottom-player-right">
        {/* 대기열 추가 */}
        <button 
          onClick={handleAddToQueue}
          className="playback-btn queue-add-btn"
          title="현재 곡을 대기열에 추가"
          disabled={!currentTrack}
        >
          <ListPlus size={18} />
        </button>

        {/* 플레이리스트 추가 */}
        <Dropdown
          align="right"
          trigger={(isOpen) => (
            <button 
              onClick={loadUserPlaylists}
              className={`playback-btn playlist-add-btn ${isOpen ? 'active' : ''}`}
              title="현재 곡을 플레이리스트에 추가"
              disabled={!currentTrack}
            >
              <FolderPlus size={16} />
            </button>
          )}
        >
          {(close) => (
            <div className="track-dropdown-subpanel" onClick={(e) => e.stopPropagation()}>
              <div className="track-dropdown-header">
                <span className="track-dropdown-header-title">플레이리스트에 추가</span>
              </div>
              <div className="track-dropdown-playlists-list scrollbar-none">
                {playlists.map(pl => (
                  <button 
                    key={pl.id} 
                    onClick={() => {
                      handleAddToPlaylist(pl);
                      close();
                    }} 
                    className="track-dropdown-playlist-item"
                  >
                    <span className="dropdown-item-icon"><ListMusic size={14} /></span>
                    <span className="dropdown-playlist-title">{pl.title}</span>
                  </button>
                ))}
                {playlists.length === 0 && (
                  <div className="track-dropdown-empty">플레이리스트가 없습니다</div>
                )}
              </div>
            </div>
          )}
        </Dropdown>

        {/* 수면 타이머 */}
        <Dropdown
          align="right"
          trigger={(isOpen) => (
            <button 
              className={`playback-btn sleep-btn ${isOpen || sleepTimer ? 'active' : ''}`}
              title={sleepTimer ? `수면 예약: ${formatSleepTime(sleepTimer)} 남음` : '수면 예약 설정'}
              disabled={!currentTrack}
            >
              <ClockPlus size={16} />
              {sleepTimer && <span className="sleep-badge">{formatSleepTime(sleepTimer)}</span>}
            </button>
          )}
        >
          {(close) => (
            <SleepTimerMenu 
              sleepTimer={sleepTimer}
              handleSleepTimerOption={handleSleepTimerOption}
              close={close}
            />
          )}
        </Dropdown>

        {/* 볼륨 컨트롤 */}
        <VolumePopover 
          volume={volume}
          isMuted={isMuted}
          changeVolume={changeVolume}
          toggleMute={toggleMute}
          currentTrack={currentTrack}
        />
      </div>
    </div>
  );
}

function SleepTimerMenu({ sleepTimer, handleSleepTimerOption, close }) {
  const [isCustomInput, setIsCustomInput] = useState(false);
  const [customMins, setCustomMins] = useState('45');

  const handleApplyCustom = (e) => {
    if (e) e.preventDefault();
    const mins = parseInt(customMins, 10);
    if (!isNaN(mins) && mins > 0) {
      handleSleepTimerOption(mins);
      if (close) close();
    }
  };

  const presetValues = [
    { label: '사용 안함', mins: null, value: null },
    { label: '5분', mins: 5, value: 300 },
    { label: '15분', mins: 15, value: 900 },
    { label: '30분', mins: 30, value: 1800 },
    { label: '45분', mins: 45, value: 2700 },
    { label: '60분', mins: 60, value: 3600 },
  ];

  const formatSleepTime = (seconds) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins >= 60) {
      const hrs = Math.floor(mins / 60);
      const remainMins = mins % 60;
      return `${hrs}시간 ${remainMins > 0 ? `${remainMins}분` : ''}`;
    }
    return `${mins}분 ${secs > 0 ? `${secs}초` : ''}`;
  };

  return (
    <div className="sleep-menu-popover-content">
      <div className="sleep-menu-header">
        <Moon size={14} className="sleep-header-icon" />
        <span className="sleep-header-title">수면 예약</span>
        {sleepTimer && (
          <span className="sleep-header-badge">{formatSleepTime(sleepTimer)}</span>
        )}
      </div>

      {!isCustomInput ? (
        <div className="sleep-options-list">
          {presetValues.map((item) => {
            const isSelected = item.mins === null ? sleepTimer === null : sleepTimer === item.value;
            return (
              <button
                key={item.label}
                onClick={() => {
                  handleSleepTimerOption(item.mins);
                  close();
                }}
                className={`sleep-option ${isSelected ? 'selected' : ''}`}
              >
                <span>{item.label}</span>
                {isSelected && <Check size={14} className="sleep-check-icon" />}
              </button>
            );
          })}
          <div className="sleep-option-divider" />
          <button
            onClick={() => setIsCustomInput(true)}
            className={`sleep-option custom ${sleepTimer && !presetValues.some(p => p.value === sleepTimer) ? 'selected' : ''}`}
          >
            <span>직접 입력...</span>
            {sleepTimer && !presetValues.some(p => p.value === sleepTimer) && (
              <Check size={14} className="sleep-check-icon" />
            )}
          </button>
        </div>
      ) : (
        <form className="sleep-custom-form" onSubmit={handleApplyCustom}>
          <div className="sleep-custom-input-wrapper">
            <input
              type="number"
              min="1"
              max="1440"
              value={customMins}
              onChange={(e) => setCustomMins(e.target.value)}
              placeholder="45"
              className="sleep-custom-input"
              autoFocus
            />
            <span className="sleep-custom-unit">분 후 종료</span>
          </div>
          <div className="sleep-custom-actions">
            <button
              type="button"
              onClick={() => setIsCustomInput(false)}
              className="sleep-custom-btn cancel"
            >
              취소
            </button>
            <button type="submit" className="sleep-custom-btn confirm">
              설정
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
