import { useQuery } from '@tanstack/react-query';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/** 채널(공개 프로필) 데이터. 없는 핸들이면 { notFound: true } */
export function useChannel(handle) {
  return useQuery({
    queryKey: ['channel', handle],
    enabled: Boolean(handle),
    staleTime: 1000 * 60,
    retry: (count, err) => err?.status !== 404 && count < 2,
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/channels/${encodeURIComponent(handle)}`);
      if (res.status === 404) return { notFound: true };
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(body?.message || `HTTP ${res.status}`);
        err.status = res.status;
        throw err;
      }
      return body;
    },
  });
}

/** 채널 주소 (/@handle) */
export function channelPath(handle) {
  return `/@${handle}`;
}

export function channelUrl(handle) {
  return `${window.location.origin}${channelPath(handle)}`;
}
