import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../contexts/AuthContext';
import { useAuth } from '../contexts/AuthContext';

export function usePlaylistTracksQuery(playlistId) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['tracks', playlistId, user?.id || 'guest'],
    initialData: () => {
      if (!playlistId) return undefined;
      try {
        const localTr = localStorage.getItem('sofar_tracks');
        if (!localTr) return undefined;
        const parsed = JSON.parse(localTr);
        const filtered = parsed.filter(t => t.playlist_id === playlistId);
        return filtered.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
      } catch (e) {
        return undefined;
      }
    },
    queryFn: async () => {
      if (!playlistId) return [];

      if (user && !user.isGuest && supabase) {
        const { data, error } = await supabase
          .from('tracks')
          .select('*')
          .eq('playlist_id', playlistId)
          .order('sequence', { ascending: true });
        if (error) throw error;
        return data || [];
      } else {
        const localTr = localStorage.getItem('sofar_tracks');
        if (localTr) {
          const parsed = JSON.parse(localTr);
          const filtered = parsed.filter(t => t.playlist_id === playlistId);
          return filtered.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
        }
        return [];
      }
    },
    enabled: !!playlistId,
    staleTime: 1000 * 60 * 5,
  });
}

export function useAddTrackMutation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (trackData) => {
      const { playlistId, videoId, title, artist, sequence } = trackData;

      if (user && !user.isGuest && supabase) {
        const { data, error } = await supabase
          .from('tracks')
          .insert({
            playlist_id: playlistId,
            youtube_video_id: videoId,
            custom_title: title,
            custom_artist: artist,
            sequence: sequence ?? 0,
          })
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        const localTr = localStorage.getItem('sofar_tracks');
        const tracks = localTr ? JSON.parse(localTr) : [];
        const newTrack = {
          id: `tr-${Date.now()}-${Math.random()}`,
          playlist_id: playlistId,
          youtube_video_id: videoId,
          custom_title: title,
          custom_artist: artist,
          sequence: sequence ?? tracks.filter(t => t.playlist_id === playlistId).length,
          created_at: new Date().toISOString()
        };
        const updated = [...tracks, newTrack];
        localStorage.setItem('sofar_tracks', JSON.stringify(updated));
        return newTrack;
      }
    },
    onSuccess: (newTrack) => {
      queryClient.invalidateQueries({ queryKey: ['tracks'] });
      queryClient.invalidateQueries({ queryKey: ['playlist-previews'] });
      queryClient.invalidateQueries({ queryKey: ['home-top-feed'] });
    },
  });
}

export function useDeleteTrackMutation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ trackId, playlistId }) => {
      if (user && !user.isGuest && supabase) {
        const { error } = await supabase
          .from('tracks')
          .delete()
          .eq('id', trackId);
        if (error) throw error;
      } else {
        const localTr = localStorage.getItem('sofar_tracks');
        const tracks = localTr ? JSON.parse(localTr) : [];
        const updated = tracks.filter(t => t.id !== trackId);
        localStorage.setItem('sofar_tracks', JSON.stringify(updated));
      }
      return { trackId, playlistId };
    },
    onSuccess: ({ playlistId }) => {
      queryClient.invalidateQueries({ queryKey: ['tracks', playlistId] });
      queryClient.invalidateQueries({ queryKey: ['playlist-previews'] });
      queryClient.invalidateQueries({ queryKey: ['home-top-feed'] });
    },
  });
}

export function useReorderTracksMutation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ playlistId, reorderedTracks }) => {
      if (user && !user.isGuest && supabase) {
        // Upsert or sequential update sequence
        const updates = reorderedTracks.map((t, idx) => ({
          id: t.id,
          playlist_id: playlistId,
          sequence: idx
        }));

        for (const update of updates) {
          await supabase
            .from('tracks')
            .update({ sequence: update.sequence })
            .eq('id', update.id);
        }
      } else {
        const localTr = localStorage.getItem('sofar_tracks');
        if (localTr) {
          const tracks = JSON.parse(localTr);
          const otherTracks = tracks.filter(t => t.playlist_id !== playlistId);
          const updatedPlaylistTracks = reorderedTracks.map((t, idx) => ({
            ...t,
            sequence: idx
          }));
          localStorage.setItem('sofar_tracks', JSON.stringify([...otherTracks, ...updatedPlaylistTracks]));
        }
      }
      return playlistId;
    },
    onSuccess: (playlistId) => {
      queryClient.invalidateQueries({ queryKey: ['tracks', playlistId] });
      queryClient.invalidateQueries({ queryKey: ['playlist-previews'] });
      queryClient.invalidateQueries({ queryKey: ['home-top-feed'] });
    },
  });
}
