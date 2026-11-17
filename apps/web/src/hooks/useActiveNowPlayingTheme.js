import { useMemo, useSyncExternalStore } from 'react';
import { useAudio } from '../contexts/AudioContext';
import { usePlaylistsQuery } from './usePlaylists';
import { getPlaylistTheme, normalizeTheme, subscribeThemes, getThemesVersion } from '../utils/nowPlayingTheme';

/**
 * 현재 재생 중인 "내 플레이리스트"의 Now Playing 테마를 반환합니다.
 * 내 플레이리스트가 아닌 출처(차트, 공유 플레이리스트, 대기열)에서는 기본 테마를 반환합니다.
 */
export function useActiveNowPlayingTheme() {
  const { playingSource } = useAudio();
  const { data: playlists } = usePlaylistsQuery();
  // 로컬 테마 사본이 바뀌면 다시 계산 (DB 행이 그대로여도 즉시 반영)
  const themesVersion = useSyncExternalStore(subscribeThemes, getThemesVersion, getThemesVersion);

  return useMemo(() => {
    if (playingSource?.type !== 'my' || !playingSource.playlistId) {
      return { theme: normalizeTheme(null), playlist: null };
    }
    const playlist = (playlists || []).find((pl) => pl.id === playingSource.playlistId) || null;
    return { theme: getPlaylistTheme(playlist), playlist };
  }, [playingSource, playlists, themesVersion]);
}
