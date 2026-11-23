/**
 * 플레이리스트 좋아요·조회·공유 유입, 추천 '관심 없음' API.
 * 어뷰징 검사와 중복 차단은 서버(apps/api/src/listening/signals.service.ts)가 한다.
 */
import { authHeaders, getClientId } from './listeningTelemetry';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** 서버에 저장된 공개 플레이리스트만 반응을 받을 수 있다 (sofar 플레이리스트·차트 목록 제외) */
export function supportsPlaylistSignals(playlist) {
  return Boolean(playlist && !playlist.isChartContext && UUID_RE.test(String(playlist.id || '')));
}

async function request(path, { method = 'GET', body, keepalive = false } = {}) {
  const res = await fetch(`${API_URL}/api/${path}`, {
    method,
    keepalive,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...authHeaders(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch (e) { /* noop */ }
  if (!res.ok) {
    const message = Array.isArray(json?.message) ? json.message[0] : json?.message;
    const error = new Error(message || '요청을 처리하지 못했습니다.');
    error.status = res.status;
    throw error;
  }
  return json;
}

/** 여러 공개 플레이리스트의 좋아요 수 { [id]: count } (카드 표시용) */
export async function fetchPlaylistLikeCounts(ids) {
  const valid = Array.from(new Set((ids || []).filter((id) => UUID_RE.test(String(id)))));
  if (valid.length === 0) return {};
  const json = await request(`playlists/likes?ids=${valid.join(',')}`);
  return json?.counts || {};
}

export function fetchPlaylistSignals(playlistId) {
  return request(`playlists/${playlistId}/signals`);
}

export function setPlaylistLike(playlistId, liked) {
  return request(`playlists/${playlistId}/like`, { method: 'POST', body: { liked } });
}

/** 조회 기록 (서버가 사람당 하루 1회로 거른다). 실패해도 화면에는 영향 없음 */
export function recordPlaylistView(playlistId, source = 'unknown') {
  request('events/playlist-view', {
    method: 'POST',
    keepalive: true,
    body: { playlistId, source, clientId: getClientId() },
  }).catch(() => {});
}

/** 공유 링크용 코드 발급. 실패하면 null (코드 없는 링크로 대신 공유) */
export async function createPlaylistShareCode(playlistId) {
  try {
    const json = await request(`playlists/${playlistId}/share`, {
      method: 'POST',
      body: { clientId: getClientId() },
    });
    return json?.shareId || null;
  } catch (e) {
    return null;
  }
}

/** 공유 링크로 들어온 방문 기록 (공유한 본인·같은 사람 반복은 서버가 거른다) */
export function recordShareVisit(shareId, playlistId) {
  request('events/share-visit', {
    method: 'POST',
    keepalive: true,
    body: { shareId, playlistId, clientId: getClientId() },
  }).catch(() => {});
}

/** 추천 '관심 없음' (본인 추천에만 영향) */
export function sendNotInterested({ itemType, itemId, artist }) {
  return request('recommend/feedback', {
    method: 'POST',
    body: { itemType, itemId, artist, clientId: getClientId() },
  });
}
