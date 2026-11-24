import { Play, ListPlus, Link2 } from 'lucide-react';
import PlaylistCard from '../playlist/PlaylistCard';
import { useAudio } from '../../contexts/AudioContext';
import { isShareablePlaylistId, copyPlaylistShareUrl } from '../../utils/shareLink';

/**
 * 홈 'sofar 플레이리스트', 내 정보 '내가 공유한 플레이리스트', 채널 목록에서 쓰는 카드.
 * subText를 주면 만든 사람 자리에 대신 보여 준다 (채널: 만든 시점).
 * 모양은 공용 PlaylistCard를 그대로 쓰고, 메뉴 구성만 여기서 정한다.
 */
export default function SharedPlaylistCard({
  playlist,
  isActive,
  onSelectPlaylist,
  onPlayPlaylist,
  onAddPlaylistToQueue,
  canCopyLink = false,
  showAuthor = true,
  likeCount = 0,
  subText,
}) {
  const { showToast } = useAudio();
  const isOfficial = playlist.playlistSource === 'category';

  const menuOptions = [
    {
      label: '대기열 추가',
      icon: <ListPlus size={16} />,
      onClick: (e) => {
        e?.stopPropagation();
        onAddPlaylistToQueue(playlist);
      },
    },
    {
      label: '전체 재생',
      icon: <Play size={16} />,
      onClick: (e) => {
        e?.stopPropagation();
        onPlayPlaylist(playlist);
      },
    },
    // 공유 플레이리스트만 링크 복사 제공 (사이드바 메뉴와 같은 문구)
    ...(canCopyLink && isShareablePlaylistId(playlist.id) ? [{
      label: '링크 복사',
      icon: <Link2 size={16} />,
      onClick: async (e) => {
        e?.stopPropagation();
        const ok = await copyPlaylistShareUrl(playlist.id);
        showToast(ok ? '공유 링크가 복사되었습니다.' : '링크를 복사하지 못했습니다.');
      },
    }] : []),
  ];

  return (
    <PlaylistCard
      playlist={playlist}
      official={isOfficial}
      showAuthor={showAuthor}
      subText={subText}
      likeCount={likeCount}
      isActive={isActive}
      onOpen={() => onSelectPlaylist(playlist)}
      menuOptions={menuOptions}
    />
  );
}
