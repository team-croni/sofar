import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Headphones, MoreVertical, ListPlus, Link2, EyeOff } from 'lucide-react';
import TrackThumbnail from '../playlist/TrackThumbnail';
import TrackActionDropdown from '../ui/TrackActionDropdown';
import Dropdown from '../ui/Dropdown';
import PlaylistCard from '../playlist/PlaylistCard';
import { useHomePanel } from '../../hooks/useHomePanel';
import { useHomeRecommendations } from '../../hooks/useHomeRecommendations';
import { markNextPlayAttribution } from '../../utils/listeningTelemetry';
import { formatArtistName } from '../../utils/trackUtils';
import { isShareablePlaylistId, copyPlaylistShareUrl } from '../../utils/shareLink';
import { handleTrackDragStart } from '../../utils/dragUtils';
import { sendNotInterested } from '../../utils/playlistSignals';

/**
 * 커버는 키보드로도 누를 수 있는 '버튼 역할' 요소다.
 * 진짜 <button>이면 드래그 유틸이 버튼에서 시작한 드래그를 막기 때문에 div로 둔다.
 * Enter/Space를 누르면 클릭을 일으켜 카드의 클릭 동작(재생/열기)으로 이어진다.
 */
function handleCoverKeyDown(e) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    e.currentTarget.click();
  }
}

const MIX_CONTEXT_ID = 'recommend-mix';

const TABS = [
  { id: 'track', label: '노래' },
  { id: 'playlist', label: '플레이리스트' },
];

function TrackCover({ track, isPlaying }) {
  const artwork = track.artwork
    || (track.youtube_video_id ? `https://img.youtube.com/vi/${track.youtube_video_id}/hqdefault.jpg` : null);
  if (artwork) return <img src={artwork} alt="" className="foryou-card__img" draggable={false} />;
  return (
    <TrackThumbnail
      title={track.custom_title}
      artist={track.custom_artist}
      youtubeId={track.youtube_video_id}
      fallback="vinyl"
      spinning={isPlaying}
    />
  );
}

const SKELETON_COUNT = 12;
const REVEAL_DURATION_MS = 900;

// 이미 순서대로 보여 준 추천 응답 ID (다른 화면에 갔다 와도 같은 추천이면 다시 움직이지 않음)
let lastRevealedRequestId = null;

function ForYouSkeleton() {
  return (
    <div className="foryou-grid foryou-grid--skeleton" aria-hidden="true">
      {Array.from({ length: SKELETON_COUNT }, (_, i) => (
        <div key={i} className="foryou-card foryou-card--track foryou-card--skeleton">
          <div className="foryou-card__cover-wrap">
            <div className="foryou-card__cover foryou-skeleton-block" />
          </div>
          <div className="foryou-card__meta">
            <span className="foryou-skeleton-line foryou-skeleton-block" style={{ width: '72%', height: 14 }} />
            <span className="foryou-skeleton-line foryou-skeleton-block" style={{ width: '46%', height: 11 }} />
            <span className="foryou-skeleton-line foryou-skeleton-block" style={{ width: '60%', height: 10 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function KebabTrigger(isOpen) {
  return (
    <button
      type="button"
      className={`album-card__kebab-btn ${isOpen ? 'active' : ''}`}
      title="더보기"
      aria-label="더보기"
    >
      <MoreVertical size={14} strokeWidth={1.5} fill="currentColor" />
    </button>
  );
}

export default function ForYouSection() {
  const {
    playTrack,
    addToQueue,
    handleAddQueue,
    showToast,
    isTrackCurrent,
    activeSharedPlaylist,
    setActiveSharedPlaylist,
    setPlayingSource,
    openSharedPlaylistInSidebar,
  } = useHomePanel();
  const { data, items, personalized, isLoading, logEvent } = useHomeRecommendations();
  const [activeTab, setActiveTab] = useState('track');
  const [hiddenIds, setHiddenIds] = useState(() => new Set());
  const sectionRef = useRef(null);
  const loggedRef = useRef(new Set());
  // 카드가 순서대로 나타나는 상태: pending(화면에 보이길 기다림) → revealing → done
  const [revealState, setRevealState] = useState('done');
  const revealTimerRef = useRef(null);

  const startReveal = () => {
    setRevealState('revealing');
    clearTimeout(revealTimerRef.current);
    revealTimerRef.current = setTimeout(() => setRevealState('done'), REVEAL_DURATION_MS);
  };

  useEffect(() => () => clearTimeout(revealTimerRef.current), []);

  const trackItems = useMemo(
    () => items.filter((item) => item.type === 'track' && item.track && !hiddenIds.has(item.id)),
    [items, hiddenIds],
  );
  const playlistItems = useMemo(
    () => items.filter((item) => item.type === 'playlist' && item.playlist && !hiddenIds.has(item.id)),
    [items, hiddenIds],
  );
  const mixTracks = useMemo(() => trackItems.map((item) => item.track), [trackItems]);

  // 로딩 중에는 탭을 그대로 보여 줘서 결과가 들어와도 머리글 높이가 바뀌지 않게 한다
  const tabs = isLoading
    ? TABS
    : TABS.filter((tab) => (tab.id === 'track' ? trackItems.length : playlistItems.length) > 0);
  const currentTab = tabs.some((tab) => tab.id === activeTab) ? activeTab : tabs[0]?.id;
  const visibleItems = currentTab === 'playlist' ? playlistItems : trackItems;

  // 새 추천을 받으면 섹션이 화면에 들어오기 직전에 카드를 순서대로 띄운다.
  // 홈 맨 아래라 결과가 먼저 도착하는 경우가 많아, 도착 즉시가 아니라 보일 때 시작한다.
  const requestId = data?.requestId;
  useEffect(() => {
    if (!requestId || requestId === lastRevealedRequestId) return undefined;
    const node = sectionRef.current;
    if (!node) return undefined;
    setRevealState('pending');
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        lastRevealedRequestId = requestId;
        startReveal();
        observer.disconnect();
      }
    }, { rootMargin: '0px 0px 120px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [requestId]);

  // 탭별로 화면에 실제로 보였을 때 한 번만 노출 기록
  useEffect(() => {
    const node = sectionRef.current;
    const key = `${data?.requestId}:${currentTab}`;
    if (!node || !data?.requestId || visibleItems.length === 0) return undefined;
    if (loggedRef.current.has(key)) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        loggedRef.current.add(key);
        logEvent('impression', visibleItems.map((item, position) => ({ item, position })));
        observer.disconnect();
      }
    }, { threshold: 0.2 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [data?.requestId, currentTab, visibleItems, logEvent]);

  if (!isLoading && tabs.length === 0) return null;

  const title = personalized ? '취향 저격 추천' : '이런 음악은 어때요?';

  const attribute = (item, position) => {
    logEvent('click', [{ item, position }]);
    markNextPlayAttribution({
      sourceId: item.type === 'track' ? MIX_CONTEXT_ID : item.itemId,
      recAlgo: data?.algo,
      recRequestId: data?.requestId,
    });
  };

  const playRecommendedTrack = (item, position) => {
    attribute(item, position);
    playTrack(item.track, mixTracks);
    const mixContext = {
      id: MIX_CONTEXT_ID,
      title,
      tracks: mixTracks,
      isChartContext: true,
      isRecommendContext: true,
    };
    setActiveSharedPlaylist?.(mixContext);
    setPlayingSource?.({ type: 'shared', data: mixContext });
  };

  const toPlaylistObject = (item) => ({
    ...item.playlist,
    recommendKind: item.playlistKind,
    openSource: 'recommend',
  });

  // '관심 없음': 바로 화면에서 빼고, 다음 추천부터 반영되도록 서버에 기록
  const hideItem = async (item, position) => {
    setHiddenIds((prev) => new Set(prev).add(item.id));
    logEvent('click', [{ item, position }]);
    try {
      await sendNotInterested({
        itemType: item.type === 'track' ? 'track' : item.playlistKind,
        itemId: item.itemId,
        artist: item.track?.custom_artist,
      });
      showToast('이 추천은 더 이상 표시하지 않습니다.');
    } catch (error) {
      setHiddenIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      showToast(error.message || '요청을 처리하지 못했습니다.');
    }
  };

  const notInterestedOption = (item, position) => ({
    label: '관심 없음',
    icon: <EyeOff size={15} />,
    onClick: (e) => {
      e?.stopPropagation();
      hideItem(item, position);
    },
  });

  const openPlaylist = (item, position) => {
    logEvent('click', [{ item, position }]);
    const playlist = toPlaylistObject(item);
    openSharedPlaylistInSidebar?.(playlist);
    setPlayingSource?.({ type: 'shared', data: playlist });
  };

  const playPlaylist = (item, position) => {
    const playlist = toPlaylistObject(item);
    if (!playlist.tracks?.length) {
      showToast('플레이리스트에 곡이 없습니다.');
      return;
    }
    attribute(item, position);
    playTrack(playlist.tracks[0], playlist.tracks);
    openSharedPlaylistInSidebar?.(playlist);
    setPlayingSource?.({ type: 'shared', data: playlist });
    showToast(`'${playlist.title}' 재생 시작 (${playlist.tracks.length}곡)`);
  };

  const playlistMenu = (item, position) => {
    const { playlist } = item;
    return [
      {
        label: '대기열 추가',
        icon: <ListPlus size={16} />,
        onClick: (e) => {
          e?.stopPropagation();
          if (playlist.tracks?.length) addToQueue(playlist.tracks, 'end');
          else showToast('대기열에 추가할 곡이 없습니다.');
        },
      },
      {
        label: '전체 재생',
        icon: <Play size={16} />,
        onClick: (e) => {
          e?.stopPropagation();
          playPlaylist(item, position);
        },
      },
      ...(item.playlistKind === 'shared' && isShareablePlaylistId(playlist.id) ? [{
        label: '링크 복사',
        icon: <Link2 size={16} />,
        onClick: async (e) => {
          e?.stopPropagation();
          const ok = await copyPlaylistShareUrl(playlist.id);
          showToast(ok ? '공유 링크가 복사되었습니다.' : '링크를 복사하지 못했습니다.');
        },
      }] : []),
      notInterestedOption(item, position),
    ];
  };

  const renderTrack = (item, position) => {
    const { track } = item;
    const isPlaying = isTrackCurrent(track);
    return (
      // 카드 전체를 누르면 재생 (키보드는 커버 버튼으로 같은 동작)
      <article
        key={item.id}
        className={`foryou-card foryou-card--track ${isPlaying ? 'foryou-card--playing' : ''}`}
        onClick={() => playRecommendedTrack(item, position)}
        draggable
        onDragStart={(e) => handleTrackDragStart(e, track)}
      >
        <div className="foryou-card__cover-wrap">
          <div
            role="button"
            tabIndex={0}
            className="foryou-card__cover"
            aria-label={`${track.custom_title} 재생`}
            onKeyDown={handleCoverKeyDown}
          >
            <TrackCover track={track} isPlaying={isPlaying} />
            <span className="foryou-card__overlay">
              {isPlaying
                ? <Headphones size={36} strokeWidth={1.875} className="foryou-card__now" />
                : (
                  <span className="foryou-card__play-icon">
                    <Play size={36} fill="currentColor" strokeWidth={1.5} />
                  </span>
                )}
            </span>
          </div>
        </div>
        <div className="foryou-card__meta">
          <div className="foryou-card__title-row">
            <span className="foryou-card__title" title={track.custom_title}>{track.custom_title}</span>
            <div className="foryou-card__actions" onClick={(e) => e.stopPropagation()}>
              <TrackActionDropdown
                track={track}
                onPlay={() => playRecommendedTrack(item, position)}
                onAddQueue={handleAddQueue}
                align="right"
                trigger={KebabTrigger}
                extraOptions={[notInterestedOption(item, position)]}
              />
            </div>
          </div>
          <span className="foryou-card__sub">{formatArtistName(track.custom_artist)}</span>
          <span className="foryou-card__reason">{item.reason}</span>
        </div>
      </article>
    );
  };

  const renderPlaylist = (item, position) => {
    const { playlist } = item;
    const isActive = activeSharedPlaylist && String(activeSharedPlaylist.id) === String(playlist.id);
    return (
      <PlaylistCard
        key={item.id}
        playlist={playlist}
        official={item.playlistKind === 'curated'}
        reason={item.reason}
        likeCount={playlist.likeCount || 0}
        isActive={isActive}
        onOpen={() => openPlaylist(item, position)}
        onPlay={() => playPlaylist(item, position)}
        menuOptions={playlistMenu(item, position)}
      />
    );
  };

  return (
    <section ref={sectionRef} className="home-section home-section--foryou">
      <div className="section-header">
        <div className="section-title-group">
          <h3 className="section-title">{title}</h3>
        </div>
        {tabs.length > 1 && (
          <div className="category-filter-tabs" role="tablist" aria-label={`${title} 종류`}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={currentTab === tab.id}
                className={`category-tab-btn ${currentTab === tab.id ? 'active' : ''}`}
                onClick={() => {
                  if (tab.id === currentTab) return;
                  setActiveTab(tab.id);
                  startReveal();
                }}
                disabled={isLoading}
              >
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {isLoading ? (
        <ForYouSkeleton />
      ) : (
        <div
          key={currentTab}
          className={`foryou-grid foryou-grid--${currentTab} ${revealState === 'pending' ? 'is-reveal-pending' : ''} ${revealState === 'revealing' ? 'is-revealing' : ''}`}
          role="tabpanel"
        >
          {visibleItems.map((item, position) => (
            currentTab === 'playlist' ? renderPlaylist(item, position) : renderTrack(item, position)
          ))}
        </div>
      )}
    </section>
  );
}
