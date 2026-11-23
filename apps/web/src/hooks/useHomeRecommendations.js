import { useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { authHeaders, getClientId } from '../utils/listeningTelemetry';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
// 로딩 중에도 제목이 바뀌지 않도록 마지막으로 받은 개인화 여부를 기억한다 (이 브라우저 전용)
const PERSONALIZED_KEY = 'sofar_foryou_personalized';

function readCachedPersonalized() {
  try {
    return localStorage.getItem(PERSONALIZED_KEY) === '1';
  } catch (e) {
    return false;
  }
}

async function fetchRecommendations(accessToken) {
  const res = await fetch(
    `${API_URL}/api/recommend/home?clientId=${encodeURIComponent(getClientId())}`,
    {
      headers: {
        Accept: 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return {
    requestId: json.requestId,
    algo: json.algo,
    personalized: Boolean(json.personalized),
    items: Array.isArray(json.items) ? json.items : [],
  };
}

/** 추천 노출·클릭 기록. 실패해도 화면에는 영향이 없다. */
export function sendRecommendationEvent(data, event, items) {
  if (!data?.requestId || !items?.length) return;
  try {
    fetch(`${API_URL}/api/events/recommendation`, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        clientId: getClientId(),
        requestId: data.requestId,
        algo: data.algo,
        event,
        items: items.map(({ item, position }) => ({
          itemType: item.type === 'track' ? 'track' : item.playlistKind,
          itemId: item.itemId,
          position,
          reason: item.reason,
        })),
      }),
    }).catch(() => {});
  } catch (e) { /* noop */ }
}

export function useHomeRecommendations() {
  const { user, session } = useAuth() || {};
  const userId = user && !user.isGuest ? user.id || null : null;
  const accessToken = session?.access_token || null;

  const query = useQuery({
    // 로그인 상태가 바뀌면 다시 받는다. 토큰이 준비되기 전 로그인 사용자는 기다린다.
    queryKey: ['home-recommendations', userId],
    queryFn: () => fetchRecommendations(accessToken),
    enabled: !userId || Boolean(accessToken),
    // 홈에 들어올 때마다 다시 확인한다. 새 감상 기록이 없으면 서버가 같은 결과를 바로 돌려주고,
    // 홈을 보는 동안에는 다시 받지 않으므로 보고 있던 목록이 갑자기 바뀌지 않는다.
    staleTime: 0,
    gcTime: 1000 * 60 * 30,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const personalizedNow = query.data?.personalized;
  useEffect(() => {
    if (typeof personalizedNow !== 'boolean') return;
    try {
      localStorage.setItem(PERSONALIZED_KEY, personalizedNow ? '1' : '0');
    } catch (e) { /* noop */ }
  }, [personalizedNow]);

  const logEvent = useCallback(
    (event, items) => sendRecommendationEvent(query.data, event, items),
    [query.data],
  );

  return {
    data: query.data,
    items: query.data?.items || [],
    personalized: query.data ? Boolean(query.data.personalized) : readCachedPersonalized(),
    // 로그인 토큰을 기다리는 동안(요청 전)도 로딩으로 본다
    isLoading: query.isPending && !query.isError,
    logEvent,
  };
}
