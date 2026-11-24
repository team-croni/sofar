import React from 'react';
import { useAudio } from '../../contexts/AudioContext';
import { isMatchTrack } from '../../utils/trackUtils';
import { formatDuration } from '../../utils/durationCache';
import { markNextPlayTrigger } from '../../utils/listeningTelemetry';
import RankedTrackRow from '../ui/RankedTrackRow';

/**
 * 검색 결과·최근 좋아요한 곡 한 줄. 모양은 공용 RankedTrackRow이고,
 * 여기서는 재생(검색에서 시작한 재생으로 기록)과 앨범 칸(없으면 재생 시간)만 정한다.
 */
export default function SearchTrackRow({ track, index, contextList }) {
  const { currentTrack, playTrack, addToQueue } = useAudio();

  const handlePlay = (t) => {
    markNextPlayTrigger('search');
    playTrack(t || track, contextList || null);
  };

  return (
    <RankedTrackRow
      track={track}
      rank={index}
      isCurrent={isMatchTrack(track, currentTrack)}
      onPlay={handlePlay}
      onAddQueue={(t) => addToQueue(t || track, 'end')}
      album={track.album || track.albumName || formatDuration(track.durationSec)}
    />
  );
}
