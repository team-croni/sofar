import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../contexts/AuthContext';
import { useAuth } from '../contexts/AuthContext';

export function usePlaylistsQuery() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['playlists', user?.id || 'guest'],
    initialData: () => {
      try {
        const localPl = localStorage.getItem('sofar_playlists');
        return localPl ? JSON.parse(localPl) : undefined;
      } catch (e) {
        return undefined;
      }
    },
    queryFn: async () => {
      if (user && !user.isGuest && supabase) {
        const { data, error } = await supabase
          .from('playlists')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true });
        if (error) throw error;
        return data || [];
      } else {
        const localPl = localStorage.getItem('sofar_playlists');
        if (localPl) {
          return JSON.parse(localPl);
        } else {
          const samplePlaylist = { id: 'sample-pl', title: '내 플레이리스트', created_at: new Date().toISOString() };
          localStorage.setItem('sofar_playlists', JSON.stringify([samplePlaylist]));
          localStorage.setItem('sofar_tracks', JSON.stringify([]));
          return [samplePlaylist];
        }
      }
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function usePlaylistPreviewsQuery() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['playlist-previews', user?.id || 'guest'],
    initialData: () => {
      try {
        const localTr = localStorage.getItem('sofar_tracks');
        if (!localTr) return undefined;
        const parsedTr = JSON.parse(localTr);
        const previews = {};
        parsedTr.sort((a, b) => (a.sequence || 0) - (b.sequence || 0)).forEach(t => {
          if (!previews[t.playlist_id]) previews[t.playlist_id] = [];
          if (previews[t.playlist_id].length < 4) {
            previews[t.playlist_id].push(t);
          }
        });
        return previews;
      } catch (e) {
        return undefined;
      }
    },
    queryFn: async () => {
      if (user && !user.isGuest && supabase) {
        const { data, error } = await supabase
          .from('tracks')
          .select('playlist_id, custom_title, custom_artist, youtube_video_id, sequence')
          .order('sequence', { ascending: true });
        if (error) throw error;
        
        const previews = {};
        (data || []).forEach(t => {
          if (!previews[t.playlist_id]) previews[t.playlist_id] = [];
          if (previews[t.playlist_id].length < 4) {
            previews[t.playlist_id].push(t);
          }
        });
        return previews;
      } else {
        const localTr = localStorage.getItem('sofar_tracks');
        const previews = {};
        if (localTr) {
          const parsedTr = JSON.parse(localTr);
          parsedTr.sort((a, b) => (a.sequence || 0) - (b.sequence || 0)).forEach(t => {
            if (!previews[t.playlist_id]) previews[t.playlist_id] = [];
            if (previews[t.playlist_id].length < 4) {
              previews[t.playlist_id].push(t);
            }
          });
        }
        return previews;
      }
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useCreatePlaylistMutation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (payload) => {
      const title = typeof payload === 'string' ? payload : (payload?.title || '');
      const coverUrl = typeof payload === 'object' && payload?.cover_url ? payload.cover_url : undefined;

      const authorName = user?.user_metadata?.full_name 
        || user?.user_metadata?.name 
        || user?.email?.split('@')[0] 
        || '나의 공유곡';

      if (user && !user.isGuest && supabase) {
        const insertObj = { user_id: user.id, title, author: authorName };
        if (coverUrl) insertObj.cover_url = coverUrl;

        let { data, error } = await supabase
          .from('playlists')
          .insert(insertObj)
          .select()
          .single();

        if (error) {
          const fallbackObj = { user_id: user.id, title };
          if (coverUrl) fallbackObj.cover_url = coverUrl;

          const fallback = await supabase
            .from('playlists')
            .insert(fallbackObj)
            .select()
            .single();
          data = fallback.data;
          if (fallback.error) throw fallback.error;
        }
        if (data?.id) {
          try {
            const localAuthors = localStorage.getItem('sofar_playlist_authors');
            const authorsMap = localAuthors ? JSON.parse(localAuthors) : {};
            authorsMap[data.id] = authorName;
            localStorage.setItem('sofar_playlist_authors', JSON.stringify(authorsMap));
          } catch (e) {}
        }
        return { ...data, author: authorName };
      } else {
        const localPl = localStorage.getItem('sofar_playlists');
        const playlists = localPl ? JSON.parse(localPl) : [];
        const newPl = {
          id: `pl-${Date.now()}`,
          title,
          author: authorName,
          cover_url: coverUrl || '',
          created_at: new Date().toISOString()
        };
        try {
          const localAuthors = localStorage.getItem('sofar_playlist_authors');
          const authorsMap = localAuthors ? JSON.parse(localAuthors) : {};
          authorsMap[newPl.id] = authorName;
          localStorage.setItem('sofar_playlist_authors', JSON.stringify(authorsMap));
        } catch (e) {}
        const updated = [...playlists, newPl];
        localStorage.setItem('sofar_playlists', JSON.stringify(updated));
        return newPl;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      queryClient.invalidateQueries({ queryKey: ['home-top-feed'] });
    },
  });
}

export function useUpdatePlaylistMutation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ playlistId, title, cover_url, is_public }) => {
      const authorName = user?.user_metadata?.full_name 
        || user?.user_metadata?.name 
        || user?.email?.split('@')[0] 
        || '나의 공유곡';

      const updatePayload = {};
      if (title !== undefined) updatePayload.title = title;
      if (cover_url !== undefined) updatePayload.cover_url = cover_url;
      if (is_public !== undefined) updatePayload.is_public = is_public;

      const localPl = localStorage.getItem('sofar_playlists');
      const playlists = localPl ? JSON.parse(localPl) : [];
      const updated = playlists.map(pl => pl.id === playlistId ? { ...pl, ...updatePayload, author: pl.author || authorName } : pl);
      localStorage.setItem('sofar_playlists', JSON.stringify(updated));

      try {
        const localAuthors = localStorage.getItem('sofar_playlist_authors');
        const authorsMap = localAuthors ? JSON.parse(localAuthors) : {};
        if (!authorsMap[playlistId]) {
          authorsMap[playlistId] = authorName;
          localStorage.setItem('sofar_playlist_authors', JSON.stringify(authorsMap));
        }
      } catch (e) {}

      if (cover_url !== undefined) {
        try {
          const localCovers = localStorage.getItem('sofar_playlist_covers');
          const coversMap = localCovers ? JSON.parse(localCovers) : {};
          coversMap[playlistId] = cover_url;
          localStorage.setItem('sofar_playlist_covers', JSON.stringify(coversMap));
        } catch (e) {}
      }

      if (is_public !== undefined) {
        try {
          const localShared = localStorage.getItem('sofar_shared_playlist_ids');
          let sharedIds = localShared ? JSON.parse(localShared) : [];
          if (is_public) {
            if (!sharedIds.includes(playlistId)) sharedIds.push(playlistId);
          } else {
            sharedIds = sharedIds.filter(id => id !== playlistId);
          }
          localStorage.setItem('sofar_shared_playlist_ids', JSON.stringify(sharedIds));
        } catch (e) {}
      }

      if (user && !user.isGuest && supabase) {
        try {
          const { data, error } = await supabase
            .from('playlists')
            .update(updatePayload)
            .eq('id', playlistId)
            .select()
            .single();

          if (error && (error.code === 'PGRST204' || error.status === 400)) {
            if (title !== undefined) {
              const { data: titleData } = await supabase
                .from('playlists')
                .update({ title })
                .eq('id', playlistId)
                .select()
                .single();
              if (titleData) return titleData;
            }
          } else if (data) {
            return data;
          }
        } catch (dbErr) {
          console.warn('Supabase update fallback:', dbErr);
        }
      }

      return { id: playlistId, ...updatePayload };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      queryClient.invalidateQueries({ queryKey: ['home-top-feed'] });
    },
  });
}

export function useDeletePlaylistMutation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (playlistId) => {
      if (user && !user.isGuest && supabase) {
        const { error } = await supabase
          .from('playlists')
          .delete()
          .eq('id', playlistId);
        if (error) throw error;
      } else {
        const localPl = localStorage.getItem('sofar_playlists');
        const playlists = localPl ? JSON.parse(localPl) : [];
        const updatedPl = playlists.filter(pl => pl.id !== playlistId);
        localStorage.setItem('sofar_playlists', JSON.stringify(updatedPl));

        const localTr = localStorage.getItem('sofar_tracks');
        if (localTr) {
          const tracks = JSON.parse(localTr);
          const updatedTr = tracks.filter(t => t.playlist_id !== playlistId);
          localStorage.setItem('sofar_tracks', JSON.stringify(updatedTr));
        }
      }
      return playlistId;
    },
    onSuccess: (playlistId) => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      queryClient.invalidateQueries({ queryKey: ['playlist-previews'] });
      queryClient.invalidateQueries({ queryKey: ['tracks', playlistId] });
      queryClient.invalidateQueries({ queryKey: ['home-top-feed'] });
    },
  });
}
