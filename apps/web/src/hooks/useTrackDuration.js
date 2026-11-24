import { useState, useEffect } from 'react';
import { durationCache, saveDurationCache } from '../utils/durationCache';
import { fetchVideoDurations } from '../utils/youtube';
import { itunesDurationCache } from '../utils/thumbnailCache';

/**
 * 목록 한 줄(내 플레이리스트 곡, 대기열 곡)에 표시할 곡 길이(초).
 * 곡 정보 → 캐시 → 지금 재생 중인 길이 → 유튜브 영상 길이 → iTunes 원곡 길이 순으로 찾는다.
 * 지금 재생 중인 곡이면 실제 재생 길이(audioDuration)를 우선한다.
 */
export function useTrackDuration(track, isCurrent, audioDuration) {
  const [trackDurationSec, setTrackDurationSec] = useState(() => {
    return track?.duration || track?.durationSec || durationCache.get(track?.youtube_video_id)
      || itunesDurationCache.get(track?.custom_artist, track?.custom_title) || null;
  });

  useEffect(() => {
    const explicitDuration = track?.duration || track?.durationSec;
    if (explicitDuration && explicitDuration > 0) {
      setTrackDurationSec(explicitDuration);
      if (track?.youtube_video_id) {
        durationCache.set(track.youtube_video_id, explicitDuration);
        saveDurationCache();
      }
      return;
    }

    const cached = durationCache.get(track?.youtube_video_id);
    if (cached) {
      setTrackDurationSec(cached);
      return;
    }

    if (isCurrent && audioDuration > 0) {
      setTrackDurationSec(audioDuration);
      if (track?.youtube_video_id) {
        durationCache.set(track.youtube_video_id, audioDuration);
        saveDurationCache();
      }
      return;
    }

    let active = true;
    const isValidVideoId = typeof track?.youtube_video_id === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(track.youtube_video_id);
    const videoLookup = isValidVideoId
      ? fetchVideoDurations([track.youtube_video_id]).then((res) => res?.[track.youtube_video_id] || 0)
      : Promise.resolve(0);

    // 영상 길이를 알 수 없으면(미매칭·삭제된 영상·백엔드 조회 실패) iTunes 원곡 길이로 대신 표시한다.
    // 재생을 시작하면 실제 재생 길이로 바뀐다.
    videoLookup.then((videoSec) => {
      if (!active || videoSec > 0) return;
      const cachedItunes = itunesDurationCache.get(track?.custom_artist, track?.custom_title);
      if (cachedItunes) {
        setTrackDurationSec(cachedItunes);
        return;
      }
      itunesDurationCache.resolve(track?.custom_artist, track?.custom_title).then((sec) => {
        if (active && sec > 0) setTrackDurationSec((prev) => prev || sec);
      });
    });

    return () => {
      active = false;
    };
  }, [track?.id, track?.duration, track?.durationSec, track?.youtube_video_id, track?.custom_title, track?.custom_artist, isCurrent, audioDuration]);

  useEffect(() => {
    const handleDurationCached = (e) => {
      if (e.detail?.videoId === track?.youtube_video_id && e.detail?.duration) {
        setTrackDurationSec(e.detail.duration);
      }
    };
    window.addEventListener('duration-cached', handleDurationCached);
    return () => {
      window.removeEventListener('duration-cached', handleDurationCached);
    };
  }, [track?.youtube_video_id]);

  return (isCurrent && audioDuration > 0) 
    ? audioDuration 
    : (trackDurationSec || track?.duration || track?.durationSec || durationCache.get(track?.youtube_video_id));
}
