/**
 * 감상 기록 수집
 *
 * 곡 하나를 재생하는 동안을 "재생 세션"으로 보고, 끝날 때(곡 종료·다른 곡으로 전환·탭 닫기)
 * 실제로 들은 시간과 맥락을 한 번에 서버로 보낸다. 통계와 추천은 이 기록을 바탕으로 한다.
 * 실패해도 재생에는 영향을 주지 않는다.
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const MAX_TICK_GAP_MS = 2000;
const ATTRIBUTION_TTL_MS = 15000;


let session = null;
let pendingAttribution = null;
let pendingTrigger = null;
// 직전 재생의 출처: 검색 목록에서 이어지는 자동·버튼 재생도 '검색'으로 묶기 위해 기억한다
let lastSourceType = null;
const TRIGGER_TTL_MS = 5000;
let accessToken = null;

const tabSessionId = `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export function getClientId() {
  try {
    let id = localStorage.getItem('sofar_client_id');
    if (!id) {
      id = `cli_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
      localStorage.setItem('sofar_client_id', id);
    }
    return id;
  } catch (e) {
    return 'cli_anonymous';
  }
}

export function setTelemetryAccessToken(token) {
  accessToken = token || null;
}

export function authHeaders() {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

/** 다음에 시작되는 재생이 어디서 왔는지 표시한다 (예: 홈 추천). */
export function markNextPlayAttribution(attribution) {
  pendingAttribution = { ...attribution, at: Date.now() };
}

/**
 * 다음에 시작되는 재생이 어떻게 시작됐는지 표시한다.
 * search | skip_button | auto (표시가 없으면 직접 누른 것으로 보고 click)
 */
export function markNextPlayTrigger(trigger) {
  pendingTrigger = { trigger, at: Date.now() };
}

function containsSong(list, track) {
  return Array.isArray(list) && list.some((t) => sameSong(t, track)
    || (t?.youtube_video_id && t.youtube_video_id === track?.youtube_video_id));
}

/**
 * playingSource({ type, data }) → 통계용 출처
 * 검색 등에서 바로 재생하면 playingSource가 이전 값으로 남아 있으므로,
 * 지금 곡이 그 목록에 실제로 들어 있을 때만 그 출처로 기록한다.
 */
function describeSource(playingSource, track, myPlaylistTracks) {
  if (!playingSource || typeof playingSource !== 'object') return { sourceType: 'unknown' };
  if (playingSource.type === 'my') {
    if (!containsSong(myPlaylistTracks, track)) return { sourceType: 'unknown' };
    return { sourceType: 'my', sourceId: playingSource.playlistId };
  }
  if (playingSource.type === 'queue') return { sourceType: 'queue' };
  if (playingSource.type === 'shared') {
    const data = playingSource.data || {};
    if (Array.isArray(data.tracks) && !containsSong(data.tracks, track)) {
      return { sourceType: 'unknown' };
    }
    if (data.isRecommendContext) return { sourceType: 'recommend', sourceId: data.id };
    if (data.isChartContext) return { sourceType: 'chart', sourceId: data.id };
    if (data.playlistSource === 'category' || data.category || data.recommendKind === 'curated') {
      return { sourceType: 'curated', sourceId: data.id };
    }
    return { sourceType: 'shared', sourceId: data.id };
  }
  return { sourceType: 'unknown' };
}

function detectDevice() {
  try {
    const coarse = window.matchMedia?.('(pointer: coarse)').matches;
    if (!coarse) return 'desktop';
    return Math.min(window.screen.width, window.screen.height) >= 600 ? 'tablet' : 'mobile';
  } catch (e) {
    return 'desktop';
  }
}

function sameSong(a, b) {
  return Boolean(a && b)
    && (a.custom_title || '') === (b.custom_title || '')
    && (a.custom_artist || '') === (b.custom_artist || '');
}

export function beginPlaySession(track, triggerOverride = null) {
  endPlaySession('switched');
  if (!track) return;
  const trigger = triggerOverride
    || (pendingTrigger && Date.now() - pendingTrigger.at < TRIGGER_TTL_MS ? pendingTrigger.trigger : 'click');
  pendingTrigger = null;
  const attribution = pendingAttribution && Date.now() - pendingAttribution.at < ATTRIBUTION_TTL_MS
    ? pendingAttribution
    : null;
  pendingAttribution = null;
  session = {
    track,
    startedAt: new Date(),
    listenedMs: 0,
    lastTickAt: null,
    durationSec: track.durationSec || null,
    seekCount: 0,
    trigger,
    source: attribution
      ? {
        sourceType: 'recommend',
        sourceId: attribution.sourceId,
        recAlgo: attribution.recAlgo,
        recRequestId: attribution.recRequestId,
      }
      // 검색에서 고른 곡은 바로 '검색' 출처로 정한다
      : trigger === 'search' ? { sourceType: 'search' } : null,
  };
}

/** 플레이어 폴링(200ms)마다 호출. 재생 중인 시간만 누적한다. */
export function tickPlaySession({ playing, track, duration, playingSource, myPlaylistTracks }) {
  // 새로고침 후 이어 듣기처럼 곡 선택 없이 재생만 다시 시작된 경우
  if (!session && playing && track) beginPlaySession(track, 'resume');
  if (!session) return;
  const now = Date.now();
  if (playing && session.lastTickAt !== null) {
    const gap = now - session.lastTickAt;
    if (gap > 0 && gap <= MAX_TICK_GAP_MS) session.listenedMs += gap;
  }
  session.lastTickAt = playing ? now : null;
  if (duration > 0) session.durationSec = Math.round(duration);
  // 자동 검색으로 영상 ID가 나중에 정해지는 경우를 반영
  if (track && sameSong(track, session.track) && track.youtube_video_id) {
    session.track = track;
  }
  // 출처는 재생을 시작한 직후 상태가 반영된 뒤에 정한다
  if (!session.source && playing) {
    let source = describeSource(playingSource, session.track, myPlaylistTracks);
    // 검색 목록에서 자동으로 넘어오거나 다음/이전 버튼으로 넘긴 곡
    if (source.sourceType === 'unknown' && lastSourceType === 'search'
      && (session.trigger === 'auto' || session.trigger === 'skip_button')) {
      source = { sourceType: 'search' };
    }
    session.source = source;
  }
}

export function notePlaySeek() {
  if (session) session.seekCount += 1;
}

export function endPlaySession(reason = 'switched') {
  const current = session;
  session = null;
  if (!current) return;
  const listenedSec = Math.round(current.listenedMs / 1000);
  if (listenedSec < 1) return;

  const started = current.startedAt;
  let tz = null;
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch (e) { /* noop */ }
  const source = current.source || { sourceType: 'unknown' };
  lastSourceType = source.sourceType;

  const body = {
    clientId: getClientId(),
    sessionId: tabSessionId,
    title: current.track.custom_title,
    artist: current.track.custom_artist,
    searchQuery: current.track.searchQuery,
    videoId: current.track.youtube_video_id,
    startedAt: started.toISOString(),
    listenedSec,
    durationSec: current.durationSec,
    endReason: reason,
    seekCount: current.seekCount,
    sourceType: source.sourceType,
    sourceId: source.sourceId != null ? String(source.sourceId) : undefined,
    trigger: current.trigger,
    recAlgo: source.recAlgo,
    recRequestId: source.recRequestId,
    tz,
    localHour: started.getHours(),
    localDow: started.getDay(),
    device: detectDevice(),
    locale: navigator.language,
  };

  try {
    fetch(`${API_URL}/api/events/play`, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body),
    }).catch(() => {});
  } catch (e) { /* noop */ }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => endPlaySession('closed'));
}
