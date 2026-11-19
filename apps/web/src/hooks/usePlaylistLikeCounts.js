import { useQuery } from '@tanstack/react-query';
import { fetchPlaylistLikeCounts } from '../utils/playlistSignals';

export const PLAYLIST_LIKE_COUNTS_KEY = 'playlist-like-counts';

/** 공개 플레이리스트들의 좋아요 수 { [id]: count }. 실패하면 빈 객체 (카드에 표시만 안 됨) */
export function usePlaylistLikeCounts(ids) {
  const sorted = Array.from(new Set((ids || []).map(String))).sort();
  const { data } = useQuery({
    queryKey: [PLAYLIST_LIKE_COUNTS_KEY, sorted.join(',')],
    queryFn: () => fetchPlaylistLikeCounts(sorted),
    enabled: sorted.length > 0,
    staleTime: 60 * 1000,
    retry: false,
  });
  return data || {};
}
