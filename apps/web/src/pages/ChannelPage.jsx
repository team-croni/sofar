import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link2, Pencil, Home, ListMusic, Heart, Music, CalendarDays } from 'lucide-react';
import { useAudio } from '../contexts/AudioContext';
import { Avatar, Button } from '../components/ui';
import SharedPlaylistCard from '../components/home/SharedPlaylistCard';
import { useChannel, channelUrl } from '../hooks/useChannel';
import { useHandle } from '../hooks/useHandle';
import { vinylHueFromSeed } from '../utils/vinylColor';
import './AccountPages.css';
import './ChannelPage.css';

const HEADER_HEIGHT = 64; // RightHeader 높이 (sticky 바가 이 아래에 붙는다)

function openPlaylistInSidebar(pl) {
  window.dispatchEvent(new CustomEvent('trigger-open-shared-playlist', {
    detail: { ...pl, _openedAt: Date.now() },
  }));
}

const joinedLabel = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
};

const TABS = [
  { id: 'playlists', label: '플레이리스트' },
  { id: 'about', label: '정보' },
];

const SORTS = [
  { id: 'recent', label: '최신순' },
  { id: 'popular', label: '인기순' },
];

/**
 * 스크롤에 맞춰 배너를 천천히 움직이고(패럴렉스), 바가 헤더 아래에 붙었는지 알려 준다.
 * 스크롤 컨테이너는 window가 아니라 오른쪽 본문(.right-main-content)이다.
 */
function useChannelScroll(pageRef, bannerRef, sentinelRef, enabled) {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    if (!enabled) return undefined;
    const page = pageRef.current;
    const scroller = page?.closest('.right-main-content');
    if (!page || !scroller) return undefined;

    const reduceMotion = document.documentElement.classList.contains('reduce-motion')
      || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let frame = 0;
    const update = () => {
      frame = 0;
      const y = scroller.scrollTop;
      const banner = bannerRef.current;
      if (banner && !reduceMotion) {
        const h = banner.offsetHeight || 1;
        const p = Math.min(1, Math.max(0, y / h));
        // 배너 이미지는 스크롤보다 느리게(0.45배) 내려가며 살짝 확대·흐려진다
        banner.style.setProperty('--ch-parallax', `${y * 0.45}px`);
        banner.style.setProperty('--ch-banner-fade', String(1 - p * 0.65));
      }
      const sentinel = sentinelRef.current;
      if (sentinel) {
        const top = sentinel.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
        setStuck(top <= HEADER_HEIGHT);
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [enabled, pageRef, bannerRef, sentinelRef]);

  return stuck;
}

function ChannelBanner({ channel, bannerRef }) {
  const hue = vinylHueFromSeed(channel.handle);
  return (
    <div
      ref={bannerRef}
      className="channel-banner"
      style={{ '--ch-hue': hue }}
      aria-hidden="true"
    >
      <div className="channel-banner-media">
        {channel.avatarUrl ? (
          <img src={channel.avatarUrl} alt="" className="channel-banner-img" draggable={false} />
        ) : (
          <div className="channel-banner-gradient" />
        )}
      </div>
      <div className="channel-banner-shade" />
    </div>
  );
}

function ChannelSkeleton() {
  return (
    <div className="channel-layout" aria-busy="true">
      <div className="channel-banner channel-skel" />
      <div className="channel-identity">
        <div className="channel-skel channel-skel--avatar" />
        <div className="channel-identity-text">
          <div className="channel-skel" style={{ width: 180, height: 30 }} />
          <div className="channel-skel" style={{ width: 260, height: 16 }} />
        </div>
      </div>
    </div>
  );
}

/** 채널 = sofar.app/@handle 공개 프로필 (유튜브 채널처럼 배너 + 붙는 탭 바) */
export default function ChannelPage({ handle }) {
  const navigate = useNavigate();
  const { currentTrack, playTrack, addToQueue, setPlayingSource, showToast } = useAudio();
  const { handle: myHandle } = useHandle();
  const { data, isLoading, isError } = useChannel(handle);
  const [tab, setTab] = useState('playlists');
  const [sort, setSort] = useState('recent');
  const pageRef = useRef(null);
  const bannerRef = useRef(null);
  const sentinelRef = useRef(null);
  const ready = Boolean(data && !data.notFound);
  const stuck = useChannelScroll(pageRef, bannerRef, sentinelRef, ready);

  const hasPlayer = Boolean(currentTrack);
  const isMine = Boolean(myHandle && data?.handle && myHandle === data.handle);

  const playlists = useMemo(() => {
    const list = (data?.playlists || []).map((pl) => ({
      ...pl,
      authorAvatar: data.avatarUrl,
      authorHandle: data.handle,
    }));
    if (sort === 'popular') {
      list.sort((a, b) => (b.likeCount - a.likeCount) || (b.trackCount - a.trackCount));
    }
    return list;
  }, [data, sort]);

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

  // 탭을 바꾸면 바가 붙어 있는 위치를 유지한 채 내용만 바꾼다 (너무 위로 튀지 않게)
  const selectTab = (id) => {
    setTab(id);
    const scroller = pageRef.current?.closest('.right-main-content');
    const sentinel = sentinelRef.current;
    if (stuck && scroller && sentinel) {
      scroller.scrollTop = sentinel.offsetTop - HEADER_HEIGHT;
    }
  };

  const pageClass = `acct-page channel-page scrollbar-none ${hasPlayer ? 'has-player' : ''}`;

  if (data?.notFound || isError) {
    return (
      <div className={pageClass}>
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

  if (isLoading || !data) {
    return (
      <div className={pageClass} ref={pageRef}>
        <ChannelSkeleton />
      </div>
    );
  }

  const joined = joinedLabel(data.joinedAt);

  return (
    <div className={pageClass} ref={pageRef}>
      <div className="channel-layout">
        <ChannelBanner channel={data} bannerRef={bannerRef} />

        <section className="channel-identity">
          <Avatar src={data.avatarUrl} name={data.nickname} size={128} className="channel-avatar" />
          <div className="channel-identity-text">
            <h1 className="channel-name" title={data.nickname}>{data.nickname}</h1>
            <p className="channel-sub">
              <span className="channel-handle">@{data.handle}</span>
              <span aria-hidden="true">·</span>
              <span>플레이리스트 {data.stats.playlists.toLocaleString()}개</span>
              <span aria-hidden="true">·</span>
              <span>받은 좋아요 {data.stats.likes.toLocaleString()}</span>
            </p>
            <div className="channel-actions">
              {isMine && (
                <Button variant="primary" size="sm" leadingIcon={<Pencil size={14} />} onClick={() => navigate('/me')}>
                  프로필 편집
                </Button>
              )}
              <Button variant="secondary" size="sm" leadingIcon={<Link2 size={14} />} onClick={copyLink}>
                링크 복사
              </Button>
            </div>
          </div>
        </section>

        {/* 이 지점이 헤더 아래에 닿으면 탭 바가 붙는다 */}
        <div ref={sentinelRef} className="channel-sticky-sentinel" aria-hidden="true" />
        <div className={`channel-tabbar ${stuck ? 'is-stuck' : ''}`}>
          <div className="channel-tabbar-inner">
            <div className="channel-tabbar-identity" aria-hidden={!stuck}>
              <Avatar src={data.avatarUrl} name={data.nickname} size={28} />
              <span className="channel-tabbar-name">{data.nickname}</span>
            </div>
            <div className="channel-tabs" role="tablist" aria-label="채널 메뉴">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  id={`channel-tab-${t.id}`}
                  aria-selected={tab === t.id}
                  aria-controls={`channel-panel-${t.id}`}
                  className={`channel-tab ${tab === t.id ? 'is-active' : ''}`}
                  onClick={() => selectTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {tab === 'playlists' && playlists.length > 1 && (
              <div className="channel-sort" role="group" aria-label="정렬">
                {SORTS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`channel-sort-btn ${sort === s.id ? 'is-active' : ''}`}
                    aria-pressed={sort === s.id}
                    onClick={() => setSort(s.id)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {tab === 'playlists' ? (
          <section
            id="channel-panel-playlists"
            role="tabpanel"
            aria-labelledby="channel-tab-playlists"
            className="channel-panel"
          >
            {playlists.length > 0 ? (
              // key: 정렬을 바꿀 때도 카드가 순서대로 다시 나타나게 한다
              <div className="playlist-folder-grid channel-grid" key={sort}>
                {playlists.map((pl, i) => (
                  <div key={pl.id} className="channel-grid-item" style={{ '--enter-i': Math.min(i, 9) }}>
                    <SharedPlaylistCard
                      likeCount={pl.likeCount || 0}
                      playlist={pl}
                      onSelectPlaylist={openPlaylistInSidebar}
                      onPlayPlaylist={playPlaylist}
                      onAddPlaylistToQueue={(p) => (p.tracks?.length ? addToQueue(p.tracks, 'end') : showToast('대기열에 추가할 곡이 없습니다'))}
                      canCopyLink
                      showAuthor={false}
                    />
                  </div>
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
        ) : (
          <section
            id="channel-panel-about"
            role="tabpanel"
            aria-labelledby="channel-tab-about"
            className="channel-panel channel-about"
          >
            <ul className="channel-about-stats">
              <li><ListMusic size={16} aria-hidden="true" /><strong>{data.stats.playlists.toLocaleString()}</strong><span>공개 플레이리스트</span></li>
              <li><Music size={16} aria-hidden="true" /><strong>{data.stats.tracks.toLocaleString()}</strong><span>담긴 곡</span></li>
              <li><Heart size={16} aria-hidden="true" /><strong>{data.stats.likes.toLocaleString()}</strong><span>받은 좋아요</span></li>
              {joined && (
                <li><CalendarDays size={16} aria-hidden="true" /><strong>{joined}</strong><span>가입</span></li>
              )}
            </ul>
            <div className="channel-about-link">
              <span className="channel-about-url">{channelUrl(data.handle).replace(/^https?:\/\//, '')}</span>
              <Button variant="secondary" size="sm" leadingIcon={<Link2 size={14} />} onClick={copyLink}>
                링크 복사
              </Button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
