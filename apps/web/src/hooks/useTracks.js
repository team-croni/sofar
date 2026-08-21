import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../contexts/AuthContext';
import { useAuth } from '../contexts/AuthContext';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function usePlaylistTracksQuery(playlistId) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['tracks', playlistId, user?.id || 'guest'],
    initialData: () => {
      if (!playlistId) return undefined;
      if (user && !user.isGuest) return undefined;
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
        if (!UUID_REGEX.test(playlistId)) {
          return [];
        }
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
      let { playlistId, videoId, title, artist, sequence } = trackData;

      if (user && !user.isGuest && supabase) {
        let validPlaylistId = playlistId;

        // 만약 playlistId가 유효한 UUID가 아니라면 (예: 게스트 sample-pl 등이 넘어온 경우)
        if (!UUID_REGEX.test(validPlaylistId)) {
          const { data: userPlaylists } = await supabase
            .from('playlists')
            .select('id, title')
            .eq('user_id', user.id)
            .order('created_at', { ascending: true })
            .limit(1);

          if (userPlaylists && userPlaylists.length > 0) {
            validPlaylistId = userPlaylists[0].id;
          } else {
            const authorName = user?.user_metadata?.full_name 
              || user?.user_metadata?.name 
              || user?.email?.split('@')[0] 
              || '나의 플레이리스트';
            const { data: newPl, error: plErr } = await supabase
              .from('playlists')
              .insert({
                user_id: user.id,
                title: '내 플레이리스트',
                author: authorName
              })
              .select()
              .single();
            if (plErr) throw plErr;
            validPlaylistId = newPl.id;
          }
          queryClient.invalidateQueries({ queryKey: ['playlists'] });
        }

        const cleanSequence = typeof sequence === 'number' && !isNaN(sequence) ? sequence : 0;

        const { data, error } = await supabase
          .from('tracks')
          .insert({
            playlist_id: validPlaylistId,
            youtube_video_id: videoId || '',
            custom_title: title || '알 수 없는 곡',
            custom_artist: artist || '알 수 없는 아티스트',
            sequence: cleanSequence,
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
          youtube_video_id: videoId || '',
          custom_title: title || '알 수 없는 곡',
          custom_artist: artist || '알 수 없는 아티스트',
          sequence: typeof sequence === 'number' && !isNaN(sequence) 
            ? sequence 
            : tracks.filter(t => t.playlist_id === playlistId).length,
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
      if (user && !user.isGuest && supabase && UUID_REGEX.test(trackId)) {
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
      if (user && !user.isGuest && supabase && UUID_REGEX.test(playlistId)) {
        for (let idx = 0; idx < reorderedTracks.length; idx++) {
          const t = reorderedTracks[idx];
          if (UUID_REGEX.test(t.id)) {
            await supabase
              .from('tracks')
              .update({ sequence: idx })
              .eq('id', t.id);
          }
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
