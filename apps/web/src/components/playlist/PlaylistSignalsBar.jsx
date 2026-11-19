import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Heart } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useAudio } from '../../contexts/AudioContext';
import {
  fetchPlaylistSignals,
  recordPlaylistView,
  setPlaylistLike,
} from '../../utils/playlistSignals';
import './PlaylistSignalsBar.css';

const formatCount = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}천` : String(n || 0));

/**
 * 다른 사람이 공유한 플레이리스트의 좋아요 버튼 (사이드바 상세 머리글)
 * 열릴 때 조회도 한 번 기록한다 (서버가 사람당 하루 1회로 거름).
 */
export default function PlaylistSignalsBar({ playlist }) {
  const { user } = useAuth() || {};
  const { showToast } = useAudio();
  const queryClient = useQueryClient();
  const isMember = Boolean(user && !user.isGuest);
  const queryKey = ['playlist-signals', playlist.id, isMember ? user.id : 'guest'];
  const [busy, setBusy] = useState(false);

  const { data } = useQuery({
    queryKey,
    queryFn: () => fetchPlaylistSignals(playlist.id),
    staleTime: 30 * 1000,
    retry: false,
  });

  // 열 때마다(같은 날 같은 사람은 서버에서 한 번만) 조회 기록
  useEffect(() => {
    recordPlaylistView(playlist.id, playlist.openSource || 'unknown');
  }, [playlist.id, playlist._openedAt, playlist.openSource]);

  if (!data || data.isOwner) return null;

  const requireLogin = () => {
    if (isMember) return false;
    showToast('로그인 후 이용할 수 있습니다.');
    return true;
  };

  const run = async (action, successMessage) => {
    if (busy || requireLogin()) return;
    setBusy(true);
    try {
      const next = await action();
      queryClient.setQueryData(queryKey, next);
      if (successMessage) showToast(successMessage(next));
    } catch (error) {
      showToast(error.message || '요청을 처리하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const toggleLike = () => run(() => setPlaylistLike(playlist.id, !data.liked));

  return (
    <div className="playlist-signals" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className={`playlist-signal-btn ${data.liked ? 'is-on' : ''}`}
        onClick={toggleLike}
        disabled={busy}
        aria-pressed={data.liked}
        title={data.liked ? '좋아요 취소' : '좋아요'}
      >
        <Heart size={14} strokeWidth={1.75} fill={data.liked ? 'currentColor' : 'none'} />
        <span>{formatCount(data.likeCount)}</span>
      </button>
    </div>
  );
}
