import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAudio } from '../contexts/AudioContext';

/**
 * useNowPlaying Hook
 * 
 * 사이드바 헤더 및 하단 플레이어 바 등 어디서나 NOW PLAYING 탐색(/now)과 
 * 현재 재생 중인 음악 출처(playingSource) 사이드바 복원 동작을 동기화하는 공통 훅입니다.
 */
export function useNowPlaying() {
  const navigate = useNavigate();
  const { playingSource } = useAudio();

  const navigateToNowPlaying = useCallback(() => {
    // 1. /now 라우트로 이동
    navigate('/now');

    // 2. 사이드바(PlaylistManager)에 현재 playingSource 뷰 복원 트리거 이벤트 발행
    window.dispatchEvent(new CustomEvent('trigger-restore-now-playing-view', {
      detail: { playingSource }
    }));
  }, [navigate, playingSource]);

  return {
    navigateToNowPlaying,
    playingSource
  };
}
