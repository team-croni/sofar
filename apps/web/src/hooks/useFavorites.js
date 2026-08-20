import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../contexts/AuthContext';
import { useAuth } from '../contexts/AuthContext';

const LOCAL_KEY = 'sofar_favorites';

export function useFavoritesQuery() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['favorites', user?.id || 'guest'],
    initialData: () => {
      try {
        const raw = localStorage.getItem(LOCAL_KEY);
        return raw ? JSON.parse(raw) : undefined;
      } catch (e) {
        return undefined;
      }
    },
    queryFn: async () => {
      const raw = localStorage.getItem(LOCAL_KEY);
      const localFavs = raw ? JSON.parse(raw) : [];

      if (user && !user.isGuest && supabase) {
        try {
          const { data, error } = await supabase
            .from('favorites')
            .select('*, tracks(*)')
            .eq('user_id', user.id);
          if (!error && data) {
            // map supabase data to track objects
            const remoteFavs = data.map(item => ({
              ...item.tracks,
              favorited_at: item.favorited_at
            })).filter(Boolean);
            return remoteFavs.length > 0 ? remoteFavs : localFavs;
          }
        } catch (e) {
          console.warn('Failed to fetch remote favorites:', e);
        }
      }
      return localFavs;
    },
  });
}

export function useToggleFavoriteMutation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ track, isAdding }) => {
      const raw = localStorage.getItem(LOCAL_KEY);
      const prevFavs = raw ? JSON.parse(raw) : [];
      
      let nextFavs = [];
      if (isAdding) {
        nextFavs = [{ ...track, favorited_at: new Date().toISOString() }, ...prevFavs.filter(f => f.id !== track.id)];
      } else {
        nextFavs = prevFavs.filter(f => f.id !== track.id);
      }
      localStorage.setItem(LOCAL_KEY, JSON.stringify(nextFavs));

      if (user && !user.isGuest && supabase) {
        try {
          if (isAdding) {
            const { error } = await supabase.from('favorites').upsert(
              { user_id: user.id, track_id: track.id, favorited_at: new Date().toISOString() },
              { onConflict: 'user_id,track_id' }
            );
            if (error) console.warn('Supabase favorites sync warn:', error.message);
          } else {
            const { error } = await supabase
              .from('favorites')
              .delete()
              .eq('user_id', user.id)
              .eq('track_id', track.id);
            if (error) console.warn('Supabase favorites sync warn:', error.message);
          }
        } catch (e) {
          console.warn('Supabase favorites table optional sync skipped:', e);
        }
      }
      return nextFavs;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
    },
  });
}
