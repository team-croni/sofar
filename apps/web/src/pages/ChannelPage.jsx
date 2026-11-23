import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link2, Pencil, Home, ListMusic, Heart, Music } from 'lucide-react';
import { useAudio } from '../contexts/AudioContext';
import { Avatar, Button } from '../components/ui';
import SharedPlaylistCard from '../components/home/SharedPlaylistCard';
import { useChannel, channelUrl } from '../hooks/useChannel';
import { useHandle } from '../hooks/useHandle';
import './AccountPages.css';
import './ChannelPage.css';

function openPlaylistInSidebar(pl) {
  window.dispatchEvent(new CustomEvent('trigger-open-shared-playlist', {
    detail: { ...pl, _openedAt: Date.now() },
  }));
}

const joinedLabel = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 가입`;
};

function ChannelSkeleton() {
  return (
    <section className="acct-card channel-hero" aria-busy="true">
      <div className="channel-skel channel-skel--avatar" />
      <div className="channel-hero-meta">
        <div className="channel-skel" style={{ width: 160, height: 26 }} />
        <div className="channel-skel" style={{ width: 110, height: 16 }} />
        <div className="channel-skel" style={{ width: 220, height: 14 }} />
      </div>
    </section>
  );
}

/** 채널 = sofar.app/@handle 공개 프로필 */
export default function ChannelPage({ handle }) {
  const navigate = useNavigate();
  const { currentTrack, playTrack, addToQueue, setPlayingSource, showToast } = useAudio();
  const { handle: myHandle } = useHandle();
  const { data, isLoading, isError } = useChannel(handle);
  const hasPlayer = Boolean(currentTrack);
  const isMine = Boolean(myHandle && data?.handle && myHandle === data.handle);

  const playlists = useMemo(
    () => (data?.playlists || []).map((pl) => ({
      ...pl,
      authorAvatar: data.avatarUrl,
      authorHandle: data.handle,
    })),
    [data],
  );

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(channelUrl(data.handle));
      showToast('채널 링크를 복사했습니다');
    } catch {
      showToast('링크를 복사하지 못했습니다');
    }
  };

  const playPlaylist = (pl) => {
    if (!pl.tracks?.length) {
      showToast('플레이리스트에 곡이 없습니다');
      return;
    }
    playTrack(pl.tracks[0], pl.tracks);
    setPlayingSource?.({ type: 'shared', data: pl });
    openPlaylistInSidebar(pl);
  };

  if (data?.notFound || isError) {
    return (
      <div className={`acct-page channel-page scrollbar-none ${hasPlayer ? 'has-player' : ''}`}>
        <section className="acct-card channel-missing">
          <h1 className="channel-missing-title">{data?.notFound ? '채널을 찾을 수 없습니다' : '채널을 불러오지 못했습니다'}</h1>
          <p className="channel-missing-desc">
            {data?.notFound
              ? `@${handle} 핸들을 쓰는 리스너가 없거나, 핸들이 바뀌었을 수 있습니다.`
              : '잠시 후 다시 시도해 주세요.'}
          </p>
          <Button variant="secondary" size="sm" leadingIcon={<Home size={15} />} onClick={() => navigate('/')}>
            홈으로
          </Button>
        </section>
      </div>
    );
  }

  return (
    <div className={`acct-page channel-page scrollbar-none ${hasPlayer ? 'has-player' : ''}`}>
      {isLoading || !data ? (
        <ChannelSkeleton />
      ) : (
        <>
          <section className="acct-card channel-hero">
            <Avatar src={data.avatarUrl} name={data.nickname} size={112} />
            <div className="channel-hero-meta">
              <h1 className="channel-name" title={data.nickname}>{data.nickname}</h1>
              <span className="channel-handle">@{data.handle}</span>
              <ul className="channel-stats" aria-label="채널 요약">
                <li><ListMusic size={14} aria-hidden="true" />플레이리스트 <strong>{data.stats.playlists.toLocaleString()}</strong></li>
                <li><Music size={14} aria-hidden="true" />곡 <strong>{data.stats.tracks.toLocaleString()}</strong></li>
                <li><Heart size={14} aria-hidden="true" />받은 좋아요 <strong>{data.stats.likes.toLocaleString()}</strong></li>
              </ul>
              {joinedLabel(data.joinedAt) && <span className="channel-joined">{joinedLabel(data.joinedAt)}</span>}
            </div>
            <div className="channel-actions">
              {isMine && (
                <Button variant="secondary" size="sm" leadingIcon={<Pencil size={14} />} onClick={() => navigate('/me')}>
                  프로필 편집
                </Button>
              )}
              <Button variant="secondary" size="sm" leadingIcon={<Link2 size={14} />} onClick={copyLink}>
                링크 복사
              </Button>
            </div>
          </section>

          <section className="home-section">
            <div className="section-header">
              <h3 className="section-title">공개 플레이리스트</h3>
            </div>
            {playlists.length > 0 ? (
              <div className="playlist-folder-grid">
                {playlists.map((pl) => (
                  <SharedPlaylistCard
                    key={pl.id}
                    likeCount={pl.likeCount || 0}
                    playlist={pl}
                    onSelectPlaylist={openPlaylistInSidebar}
                    onPlayPlaylist={playPlaylist}
                    onAddPlaylistToQueue={(p) => (p.tracks?.length ? addToQueue(p.tracks, 'end') : showToast('대기열에 추가할 곡이 없습니다'))}
                    canCopyLink
                    showAuthor={false}
                  />
                ))}
              </div>
            ) : (
              <p className="acct-empty">
                {isMine
                  ? '아직 공개한 플레이리스트가 없습니다. 사이드바에서 플레이리스트 메뉴의 ‘공유하기’를 눌러 보세요.'
                  : '아직 공개한 플레이리스트가 없습니다.'}
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
