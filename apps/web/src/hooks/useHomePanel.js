import { useAudio } from '../contexts/AudioContext';
import { useHomeFeed } from './useHomeFeed';
import { searchYoutube } from '../utils/youtube';
import { isMatchTrack } from '../utils/trackUtils';

export function useHomePanel() {
  const {
    playTrack,
    addToQueue,
    openQueueInSidebar,
    setQueue,
    showToast,
    currentTrack,
    activeSharedPlaylist,
    setActiveSharedPlaylist,
    setPlayingSource,
    isShuffle,
    setIsShuffle,
    isShuffleFor,
    toggleShuffleFor,
  } = useAudio();

  const { topTracks, statTracks, sharedPlaylists, categoryPlaylists, isLoading: feedLoading } = useHomeFeed();

  const isTrackCurrent = (track) => {
    return isMatchTrack(track, currentTrack);
  };

  const handlePlayTrack = (track, chartList = null, sidebarLabel = null) => {
    playTrack(track, chartList);
    if (chartList && chartList.length > 0 && sidebarLabel) {
      const chartContextObj = {
        id: `chart-context-${sidebarLabel}`,
        title: sidebarLabel,
        tracks: chartList,
        isChartContext: true,
      };
      if (setActiveSharedPlaylist) setActiveSharedPlaylist(chartContextObj);
      if (setPlayingSource) setPlayingSource({ type: 'shared', data: chartContextObj });
    }
  };

  const handleAddQueue = async (track, position) => {
    if (track.youtube_video_id) {
      addToQueue(track, position);
      showToast(`'${track.custom_title}' 대기열 추가됨`);
      return;
    }

    const query = track.searchQuery || `${track.custom_title} ${track.custom_artist}`;
    try {
      const results = await searchYoutube(query);
      if (results && results.length > 0) {
        addToQueue({
          ...results[0],
          custom_title: track.custom_title,
          custom_artist: track.custom_artist,
        }, position);
        showToast(`'${track.custom_title}' 대기열 추가됨`);
      }
    } catch {}
  };

  const openSharedPlaylistInSidebar = (playlistObj) => {
    if (!playlistObj) return;
    const freshObj = { ...playlistObj, _openedAt: Date.now() };
    if (setActiveSharedPlaylist) setActiveSharedPlaylist(freshObj);
    window.dispatchEvent(new CustomEvent('trigger-open-shared-playlist', {
      detail: freshObj
    }));
  };

  return {
    topTracks,
    statTracks,
    sharedPlaylists,
    categoryPlaylists,
    feedLoading,
    currentTrack,
    activeSharedPlaylist,
    isTrackCurrent,
    handlePlayTrack,
    handleAddQueue,
    showToast,
    playTrack,
    addToQueue,
    setQueue,
    isShuffle,
    setIsShuffle,
    isShuffleFor,
    toggleShuffleFor,
    setActiveSharedPlaylist,
    setPlayingSource,
    openSharedPlaylistInSidebar,
    openQueueInSidebar,
  };
}
