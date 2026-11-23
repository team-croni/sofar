import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, useAuth } from '../contexts/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/** 만 14세 이상이 확실한 해까지만 고를 수 있다 (API와 같은 기준) */
export const MIN_AGE = 14;
export const MAX_AGE = 100;

export const GENDER_OPTIONS = [
  { value: '', label: '선택 안 함' },
  { value: 'female', label: '여성' },
  { value: 'male', label: '남성' },
  { value: 'other', label: '기타' },
];

export function birthYearOptions(now = new Date()) {
  const latest = now.getFullYear() - MIN_AGE - 1;
  const options = [{ value: '', label: '선택 안 함' }];
  for (let y = latest; y >= now.getFullYear() - MAX_AGE; y -= 1) {
    options.push({ value: String(y), label: `${y}년` });
  }
  return options;
}

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('세션이 만료되었습니다. 다시 로그인해 주세요.');
  return { Authorization: `Bearer ${token}` };
}

/**
 * 연령·성별 (선택 입력). 다른 사람에게 보이지 않도록 브라우저가 DB를 직접 읽지 않고
 * 본인 확인을 거친 API(/api/me/demographics)로만 읽고 쓴다.
 */
export function useDemographics() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isMember = Boolean(user && !user.isGuest && supabase);
  const queryKey = ['demographics', user?.id || 'guest'];

  const { data, isLoading } = useQuery({
    queryKey,
    enabled: isMember,
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/me/demographics`, { headers: await authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });

  const mutation = useMutation({
    mutationFn: async (patch) => {
      const next = {
        birthYear: data?.birthYear ?? null,
        gender: data?.gender ?? null,
        ...patch,
      };
      const res = await fetch(`${API_BASE}/api/me/demographics`, {
        method: 'PUT',
        headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || '저장하지 못했습니다.');
      return body;
    },
    onSuccess: (body) => queryClient.setQueryData(queryKey, { ...(data || {}), ...body, available: true }),
  });

  return {
    birthYear: data?.birthYear ?? null,
    gender: data?.gender ?? null,
    // 테이블이 아직 없거나(SQL 미실행) 불러오지 못하면 입력을 막는다
    isAvailable: isMember && data?.available === true,
    isLoading: isMember && isLoading,
    save: mutation.mutateAsync,
    isSaving: mutation.isPending,
  };
}
