import React, { useState, useEffect } from 'react';
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
    isLyricsExpanded
  } = useAudio();

  const navigate = useNavigate();
  const location = useLocation();

  const [jacketRect, setJacketRect] = useState(null);
  const [slotRect, setSlotRect] = useState(null);

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

  const displayInVinyl = showVideoInVinyl && !isLyricsExpanded && isNowPlayingPage;

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
      if (videoVinylState === 'slipping-in' || videoVinylState === 'video') return;
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
      className={`mini-player-container ${showMiniPlayer ? 'show' : ''} ${displayInVinyl ? 'in-vinyl' : 'in-sidebar'} ${
        videoVinylState === 'hiding-video' ? 'hiding' : ''
      }`}
      style={containerStyle}
      onClick={handleMiniPlayerClick}
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
