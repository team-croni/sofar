import { useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase, useAuth } from '../../contexts/AuthContext';
import { useAudio } from '../../contexts/AudioContext';
import { isShareablePlaylistId } from '../../utils/shareLink';

/**
 * 공유 링크(/p/:playlistId)로 진입했을 때 해당 플레이리스트를 사이드바에 열어주는 컴포넌트.
 * 링크는 진입용이므로 열고 난 뒤 주소는 홈(/)으로 교체한다.
 * - 공개 플레이리스트: 누구나 열람 (본인 소유면 편집 가능한 상태로 열림)
 * - 비공개 플레이리스트: 소유자만 열람
 */
export default function SharedPlaylistLinkOpener() {
  const { playlistId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { setActiveSharedPlaylist, showToast } = useAudio();
  const handledIdRef = useRef(null);

  useEffect(() => {
    if (!playlistId || handledIdRef.current === playlistId) return;
    handledIdRef.current = playlistId;

    const open = async () => {
      if (!supabase || !isShareablePlaylistId(playlistId)) {
        showToast('플레이리스트를 찾을 수 없습니다.');
        return;
      }

      const { data: pl, error } = await supabase
        .from('playlists')
        .select('*, tracks(id, youtube_video_id, custom_title, custom_artist, sequence, created_at)')
        .eq('id', playlistId)
        .maybeSingle();

      const isOwner = !!(pl && user && !user.isGuest && pl.user_id === user.id);
      if (error || !pl) {
        showToast('플레이리스트를 찾을 수 없습니다.');
        return;
      }
      if (!pl.is_public && !isOwner) {
        showToast('비공개 플레이리스트입니다.');
        return;
      }

      const tracks = [...(pl.tracks || [])]
        .sort((a, b) =>
          (a.sequence || 0) - (b.sequence || 0)
          || String(a.created_at || '').localeCompare(String(b.created_at || ''))
          || String(a.id).localeCompare(String(b.id))
        )
        .map(t => ({ ...t, searchQuery: `${t.custom_title} ${t.custom_artist}` }));

      setActiveSharedPlaylist({
        id: pl.id,
        user_id: pl.user_id,
        title: pl.title,
        author: pl.author || '공유 리스너',
        cover: pl.cover_url || null,
        trackCount: tracks.length,
        tracks,
        _openedAt: Date.now(),
      });
    };

    open()
      .catch(() => showToast('플레이리스트를 불러오지 못했습니다.'))
      .finally(() => navigate('/', { replace: true }));
  }, [playlistId, user, navigate, setActiveSharedPlaylist, showToast]);

  return null;
}
