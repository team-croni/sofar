import { useCallback, useSyncExternalStore } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSettings, subscribeSettings, updateSettings, resetSettings } from '../utils/settings';
import { useAuth, supabase } from '../contexts/AuthContext';
import { getUserDisplayName } from '../utils/userProfile';

/** 기기별 설정 (localStorage) */
export function useSettings() {
  const settings = useSyncExternalStore(subscribeSettings, getSettings, getSettings);
  const setSetting = useCallback((key, value) => updateSettings({ [key]: value }), []);
  return { settings, setSetting, resetSettings };
}

/** 계정 단위 설정 (profiles.preferences JSONB) */
export const DEFAULT_ACCOUNT_PREFERENCES = {
  playlistDefaultPublic: false,
  showNicknameOnShared: true,
};

export const ANONYMOUS_AUTHOR = '익명의 리스너';

// React 밖(쿼리/뮤테이션 함수)에서 쓰기 위한 마지막 계정 설정값
let cachedAccountPreferences = { ...DEFAULT_ACCOUNT_PREFERENCES };
export function getCachedAccountPreferences() {
  return cachedAccountPreferences;
}

/** 플레이리스트에 기록할 작성자 이름 (닉네임 비공개 설정 반영) */
export function getPlaylistAuthorName(user, fallback = '나의 플레이리스트') {
  if (!cachedAccountPreferences.showNicknameOnShared) return ANONYMOUS_AUTHOR;
  return getUserDisplayName(user, fallback);
}

export function useAccountPreferences() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isMember = Boolean(user && !user.isGuest && supabase);
  const queryKey = ['account-preferences', user?.id || 'guest'];

  const { data, isLoading } = useQuery({
    queryKey,
    enabled: isMember,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data: row, error } = await supabase
        .from('profiles')
        .select('preferences')
        .eq('id', user.id)
        .maybeSingle();
      // preferences 컬럼이 아직 없는 DB에서도 기본값으로 동작
      const prefs = error
        ? { ...DEFAULT_ACCOUNT_PREFERENCES }
        : { ...DEFAULT_ACCOUNT_PREFERENCES, ...(row?.preferences || {}) };
      cachedAccountPreferences = prefs;
      return prefs;
    },
  });

  const mutation = useMutation({
    mutationFn: async (patch) => {
      const next = { ...DEFAULT_ACCOUNT_PREFERENCES, ...(data || {}), ...patch };
      const { error } = await supabase
        .from('profiles')
        .update({ preferences: next, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (error) throw error;
      cachedAccountPreferences = next;
      return next;
    },
    onMutate: async (patch) => {
      const prev = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, { ...DEFAULT_ACCOUNT_PREFERENCES, ...(prev || {}), ...patch });
      return { prev };
    },
    onError: (_err, _patch, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
    },
  });

  return {
    preferences: data || DEFAULT_ACCOUNT_PREFERENCES,
    isLoading: isMember && isLoading,
    isAvailable: isMember,
    updatePreferences: mutation.mutateAsync,
    isSaving: mutation.isPending,
  };
}
