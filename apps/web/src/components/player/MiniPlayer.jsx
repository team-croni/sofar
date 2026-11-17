import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAudio } from '../../contexts/AudioContext';
import { useNowPlaying } from '../../hooks/useNowPlaying';
import './MiniPlayer.css';

export default function MiniPlayer() {
  const { navigateToNowPlaying } = useNowPlaying();
  const { 
    initPlayer, 
    isPlayerReady, 
    currentTrack, 
    isPlaying, 
    isLoadingTrack,
    showVideoInVinyl, 
    setShowVideoInVinyl,
    videoVinylState,
    setVideoVinylState,
    triggerReturnToVinyl,
    isLyricsExpanded,
    isModalOpen,
    togglePlay
  } = useAudio();

  const navigate = useNavigate();
  const location = useLocation();

  const [jacketRect, setJacketRect] = useState(null);
  const [slotRect, setSlotRect] = useState(null);

  // ── 모달과 겹칠 때 처리 (YouTube 정책: 재생 중인 플레이어 위를 다른 요소가 덮으면 안 됨) ──
  // 모달 창이 플레이어와 실제로 겹칠 때만 재생을 멈추고 플레이어를 모달 오버레이 아래로 내림.
  // 겹치지 않으면(넓은 화면) 계속 재생하며 플레이어를 맨 위에 둠.
  // 모달이 닫히면 이 로직이 멈춘 경우에만 다시 재생.
  const containerRef = useRef(null);
  const [isUnderModal, setIsUnderModal] = useState(false);
  const pausedByModalRef = useRef(false);
  const isPlayingRef = useRef(isPlaying);
  const togglePlayRef = useRef(togglePlay);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
    togglePlayRef.current = togglePlay;
  }, [isPlaying, togglePlay]);

  useEffect(() => {
    if (!isModalOpen) {
      setIsUnderModal(false);
      if (pausedByModalRef.current) {
        pausedByModalRef.current = false;
        if (!isPlayingRef.current) togglePlayRef.current?.();
      }
      return undefined;
    }

    const checkOverlap = () => {
      const playerEl = containerRef.current;
      const cards = document.querySelectorAll('.sofar-modal-card');
      if (!playerEl || cards.length === 0) return;
      const p = playerEl.getBoundingClientRect();
      const playerVisible = p.width > 0 && p.height > 0;
      const overlaps = playerVisible && Array.from(cards).some((card) => {
        const c = card.getBoundingClientRect();
        return c.left < p.right && c.right > p.left && c.top < p.bottom && c.bottom > p.top;
      });
      setIsUnderModal(overlaps);
    };

    // 모달 등장 애니메이션 이후 크기로 다시 확인
    checkOverlap();
    const raf = requestAnimationFrame(checkOverlap);
    const timer = setTimeout(checkOverlap, 260);
    // LP 영역 → 사이드바 복귀 애니메이션(0.35s)이 끝난 위치로 한 번 더 확인
    const timer2 = setTimeout(checkOverlap, 500);
    window.addEventListener('resize', checkOverlap);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      clearTimeout(timer2);
      window.removeEventListener('resize', checkOverlap);
    };
  }, [isModalOpen]);

  // 오버레이 아래로 내려간 동안에는 재생하지 않음 (사용자가 재생을 눌러도 다시 멈춤)
  useEffect(() => {
    if (isUnderModal && isPlaying) {
      pausedByModalRef.current = true;
      togglePlay();
    }
  }, [isUnderModal, isPlaying, togglePlay]);

  useEffect(() => {
    if (isPlayerReady) {
      // 플레이어 돔 엘리먼트가 마운트된 후 초기화
      initPlayer('youtube-iframe-container');
    }
  }, [initPlayer, isPlayerReady]);

  // LP 자켓 위치 및 사이드바 정적 슬롯 위치 측정
  useEffect(() => {
    const updateRects = () => {
      if (showVideoInVinyl) {
        const containerWrapper = document.querySelector('.vinyl-container-wrapper');
        if (containerWrapper) {
          const rect = containerWrapper.getBoundingClientRect();
          setJacketRect({
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          });
        } else {
          setJacketRect(null);
        }
      } else {
        setJacketRect(null);
      }

      const slot = document.getElementById('sidebar-miniplayer-slot');
      if (slot) {
        const rect = slot.getBoundingClientRect();
        setSlotRect({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        });
      } else {
        setSlotRect(null);
      }
    };

    updateRects();
    const rafId = requestAnimationFrame(updateRects);
    const timer1 = setTimeout(updateRects, 50);
    const timer2 = setTimeout(updateRects, 150);

    window.addEventListener('resize', updateRects);
    window.addEventListener('scroll', updateRects, true);

    let resizeObserver = null;
    const slotEl = document.getElementById('sidebar-miniplayer-slot');
    if (slotEl && window.ResizeObserver) {
      resizeObserver = new ResizeObserver(() => updateRects());
      resizeObserver.observe(slotEl);
    }

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timer1);
      clearTimeout(timer2);
      window.removeEventListener('resize', updateRects);
      window.removeEventListener('scroll', updateRects, true);
      if (resizeObserver && slotEl) resizeObserver.unobserve(slotEl);
    };
  }, [showVideoInVinyl, isLyricsExpanded, location.pathname, currentTrack]);

  const isNowPlayingPage = location.pathname === '/now' || location.pathname === '/now-playing';

  // Now Playing 페이지가 아닐 때 showVideoInVinyl 및 videoVinylState 자동 리셋
  useEffect(() => {
    if (!isNowPlayingPage && showVideoInVinyl) {
      setShowVideoInVinyl(false);
      setVideoVinylState('idle');
    }
  }, [isNowPlayingPage, showVideoInVinyl, setShowVideoInVinyl, setVideoVinylState]);

  const showMiniPlayer = !!currentTrack;

  // 사이드바로 복귀(hiding-video)가 시작되면 바로 사이드바 배치로 바꿔서
  // 투명해지지 않고 크기 · 위치가 그대로 사이드바 슬롯으로 이어지며 옮겨지게 함
  const displayInVinyl = showVideoInVinyl && !isLyricsExpanded && isNowPlayingPage
    && videoVinylState !== 'hiding-video';

  const handleMiniPlayerClick = () => {
    const isNowPlayingPage = location.pathname === '/now' || location.pathname === '/now-playing';

    if (!isNowPlayingPage) {
      // 현재 플레이 화면이 아니라면 플레이 화면으로 이동 및 사이드바 출처 복원
      navigateToNowPlaying();
      return;
    }

    // 현재 이미 플레이 화면이라면
    if (displayInVinyl) {
      // 앨범 자켓 모드에서 미니플레이어 모드로 전환
      triggerReturnToVinyl();
    } else {
      // 미니플레이어 모드에서 앨범 자켓 모드로 전환
      if (videoVinylState === 'slipping-in' || videoVinylState === 'video' || videoVinylState === 'hiding-video') return;
      setVideoVinylState('slipping-in');
      setTimeout(() => {
        setShowVideoInVinyl(true);
        setVideoVinylState('video');
      }, 450);
    }
  };

  // LP 영역에서는 420px x 236px로 정렬, 사이드바 영역에서는 슬롯 위치 및 크기에 배치
  const containerStyle = displayInVinyl && jacketRect
    ? {
        position: 'fixed',
        top: `${jacketRect.top + (jacketRect.height - 236) / 2}px`,
        left: `${jacketRect.left + (jacketRect.width - 420) / 2}px`,
        width: '420px',
        height: '236px',
        borderRadius: '16px',
      }
    : (slotRect
        ? {
            position: 'fixed',
            top: `${slotRect.top}px`,
            left: `${slotRect.left}px`,
            width: `${slotRect.width}px`,
            height: `${slotRect.height}px`,
            borderRadius: '16px',
          }
        : {}
      );

  const viewportStyle = displayInVinyl
    ? { width: '420px', height: '236px' }
    : { width: '100%', height: '100%' };

  return createPortal(
    <div 
      ref={containerRef}
      className={`mini-player-container ${showMiniPlayer ? 'show' : ''} ${displayInVinyl ? 'in-vinyl' : 'in-sidebar'} ${isUnderModal ? 'under-modal' : ''}`}
      style={containerStyle}
      onClick={handleMiniPlayerClick}
      {...(displayInVinyl && showMiniPlayer ? {
        'data-particle-surface': 'rect',
        'data-particle-radius': '22',
      } : {})}
    >
      <div 
        className="mini-player-viewport"
        style={viewportStyle}
      >
        <div id="youtube-iframe-container" style={{ width: '100%', height: '100%' }}></div>
      </div>
    </div>,
    document.body
  );
}
