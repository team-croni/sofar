import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, useAuth } from '../contexts/AuthContext';
import { normalizeHandle, validateHandleFormat } from '../utils/userProfile';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('세션이 만료되었습니다. 다시 로그인해 주세요.');
  return { Authorization: `Bearer ${token}` };
}

async function readJson(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message || `HTTP ${res.status}`);
  return body;
}

/** 내 핸들(@아이디). 바꾸기는 서버가 규칙·중복·30일 제한을 확인한다 */
export function useHandle() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isMember = Boolean(user && !user.isGuest && supabase);
  const queryKey = ['my-handle', user?.id || 'guest'];

  const { data, isLoading, isError } = useQuery({
    queryKey,
    enabled: isMember,
    staleTime: 1000 * 60 * 30,
    retry: 1,
    queryFn: async () =>
      readJson(await fetch(`${API_BASE}/api/me/handle`, { headers: await authHeaders() })),
  });

  const mutation = useMutation({
    mutationFn: async (handle) =>
      readJson(
        await fetch(`${API_BASE}/api/me/handle`, {
          method: 'PUT',
          headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
          body: JSON.stringify({ handle }),
        }),
      ),
    onSuccess: (body) => queryClient.setQueryData(queryKey, body),
  });

  return {
    handle: data?.handle ?? null,
    nextChangeAt: data?.nextChangeAt ?? null,
    isLoading: isMember && isLoading,
    isError,
    change: mutation.mutateAsync,
    isSaving: mutation.isPending,
  };
}

/**
 * 입력 중인 핸들을 확인한다. 형식은 바로, 예약어·중복은 입력이 멈추고 0.4초 뒤 서버에 묻는다.
 * status: 'idle' | 'same' | 'invalid' | 'checking' | 'available' | 'unavailable' | 'error'
 */
export function useHandleCheck(draft, currentHandle, enabled) {
  const handle = normalizeHandle(draft);
  const formatError = handle ? validateHandleFormat(handle) : null;
  const [result, setResult] = useState({ handle: '', status: 'idle', message: null });

  useEffect(() => {
    if (!enabled || !handle || formatError || handle === currentHandle) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const body = await readJson(
          await fetch(`${API_BASE}/api/me/handle/check?handle=${encodeURIComponent(handle)}`, {
            headers: await authHeaders(),
          }),
        );
        if (!cancelled) {
          setResult({ handle, status: body.available ? 'available' : 'unavailable', message: body.message });
        }
      } catch (e) {
        if (!cancelled) setResult({ handle, status: 'error', message: e.message });
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, handle, formatError, currentHandle]);

  if (!enabled || !handle) return { handle, status: 'idle', message: null };
  if (formatError) return { handle, status: 'invalid', message: formatError };
  if (handle === currentHandle) return { handle, status: 'same', message: null };
  if (result.handle !== handle) return { handle, status: 'checking', message: null };
  return result;
}
