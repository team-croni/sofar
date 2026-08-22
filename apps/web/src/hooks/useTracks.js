import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../contexts/AuthContext';
import { useAuth } from '../contexts/AuthContext';
import { useAudio } from '../contexts/AudioContext';
import { searchYoutube } from '../utils/youtube';

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
      let { playlistId, videoId, title, artist, sequence, durationSec, duration } = trackData;
      const validDuration = typeof durationSec === 'number' && durationSec > 0 
        ? durationSec 
        : (typeof duration === 'number' && duration > 0 ? duration : 0);

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

        if (videoId) {
          const { data: dupCheck } = await supabase
            .from('tracks')
            .select('id')
            .eq('playlist_id', validPlaylistId)
            .eq('youtube_video_id', videoId)
            .limit(1);

          if (dupCheck && dupCheck.length > 0) {
            const err = new Error('ALREADY_EXISTS');
            err.code = 'ALREADY_EXISTS';
            throw err;
          }
        }

        const cleanSequence = typeof sequence === 'number' && !isNaN(sequence) ? sequence : 0;

        const insertPayload = {
          playlist_id: validPlaylistId,
          youtube_video_id: videoId || '',
          custom_title: title || '알 수 없는 곡',
          custom_artist: artist || '알 수 없는 아티스트',
          sequence: cleanSequence,
        };
        if (validDuration > 0) {
          insertPayload.duration = validDuration;
        }

        const { data, error } = await supabase
          .from('tracks')
          .insert(insertPayload)
          .select()
          .single();
        if (error) {
          if (error.code === '23505') {
            const err = new Error('ALREADY_EXISTS');
            err.code = 'ALREADY_EXISTS';
            throw err;
          }
          if (insertPayload.duration) {
            delete insertPayload.duration;
            const { data: retryData, error: retryErr } = await supabase
              .from('tracks')
              .insert(insertPayload)
              .select()
              .single();
            if (retryErr) {
              if (retryErr.code === '23505') {
                const err = new Error('ALREADY_EXISTS');
                err.code = 'ALREADY_EXISTS';
                throw err;
              }
              throw retryErr;
            }
            return retryData;
          }
          throw error;
        }
        return data;
      } else {
        const localTr = localStorage.getItem('sofar_tracks');
        const tracks = localTr ? JSON.parse(localTr) : [];

        const isDuplicate = tracks.some(t => 
          t.playlist_id === playlistId && 
          ((videoId && t.youtube_video_id === videoId) || 
           (t.custom_title === title && t.custom_artist === artist))
        );
        if (isDuplicate) {
          const err = new Error('ALREADY_EXISTS');
          err.code = 'ALREADY_EXISTS';
          throw err;
        }

        const newTrack = {
          id: `tr-${Date.now()}-${Math.random()}`,
          playlist_id: playlistId,
          youtube_video_id: videoId || '',
          custom_title: title || '알 수 없는 곡',
          custom_artist: artist || '알 수 없는 아티스트',
          durationSec: validDuration,
          duration: validDuration,
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tracks'] });
      queryClient.invalidateQueries({ queryKey: ['playlist-previews'] });
      queryClient.invalidateQueries({ queryKey: ['home-top-feed'] });
    },
  });
}

export function useAddTracksMutation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ playlistId, tracks }) => {
      if (!tracks || tracks.length === 0) return { inserted: [], skippedCount: 0 };

      if (user && !user.isGuest && supabase && UUID_REGEX.test(playlistId)) {
        // 단일 쿼리로 대상 플레이리스트의 기존 트랙 목록 조회하여 중복 사전 필터링
        const { data: existingData } = await supabase
          .from('tracks')
          .select('youtube_video_id')
          .eq('playlist_id', playlistId);

        const existingSet = new Set(
          (existingData || []).map(t => t.youtube_video_id).filter(Boolean)
        );

        const nonDuplicates = tracks.filter(t => {
          const vId = t.youtube_video_id || t.videoId;
          return vId ? !existingSet.has(vId) : true;
        });

        if (nonDuplicates.length === 0) {
          return { inserted: [], skippedCount: tracks.length };
        }

        const { data: seqData } = await supabase
          .from('tracks')
          .select('sequence')
          .eq('playlist_id', playlistId)
          .order('sequence', { ascending: false })
          .limit(1);

        const baseSeq = seqData && seqData[0] ? (seqData[0].sequence + 1) : 0;

        const insertPayloads = nonDuplicates.map((t, idx) => ({
          playlist_id: playlistId,
          youtube_video_id: t.youtube_video_id || t.videoId || '',
          custom_title: t.custom_title || t.title || '알 수 없는 곡',
          custom_artist: t.custom_artist || t.artist || '알 수 없는 아티스트',
          duration: t.durationSec || t.duration || 0,
          sequence: baseSeq + idx,
        }));

        const { data, error } = await supabase
          .from('tracks')
          .insert(insertPayloads)
          .select();
        if (error) throw error;
        return { inserted: data || [], skippedCount: tracks.length - nonDuplicates.length };
      } else {
        const localTr = localStorage.getItem('sofar_tracks');
        const allTracks = localTr ? JSON.parse(localTr) : [];

        const existingPlaylistTracks = allTracks.filter(t => t.playlist_id === playlistId);
        const existingSet = new Set(
          existingPlaylistTracks.map(t => t.youtube_video_id).filter(Boolean)
        );

        const nonDuplicates = tracks.filter(t => {
          const vId = t.youtube_video_id || t.videoId;
          return vId ? !existingSet.has(vId) : true;
        });

        if (nonDuplicates.length === 0) {
          return { inserted: [], skippedCount: tracks.length };
        }

        const baseSeq = existingPlaylistTracks.length;
        const newInserted = nonDuplicates.map((t, idx) => ({
          id: `tr-${Date.now()}-${idx}-${Math.random()}`,
          playlist_id: playlistId,
          youtube_video_id: t.youtube_video_id || t.videoId || '',
          custom_title: t.custom_title || t.title || '알 수 없는 곡',
          custom_artist: t.custom_artist || t.artist || '알 수 없는 아티스트',
          durationSec: t.durationSec || t.duration || 0,
          duration: t.durationSec || t.duration || 0,
          sequence: baseSeq + idx,
          created_at: new Date().toISOString()
        }));

        localStorage.setItem('sofar_tracks', JSON.stringify([...allTracks, ...newInserted]));
        return { inserted: newInserted, skippedCount: tracks.length - nonDuplicates.length };
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tracks'] });
      queryClient.invalidateQueries({ queryKey: ['playlist-previews'] });
      queryClient.invalidateQueries({ queryKey: ['home-top-feed'] });
    },
  });
}

/**
 * 전역 어디서든 단일 곡을 플레이리스트에 안전하게 추가하는 통합 비즈니스 액션 훅
 */
export function useAddTrackToPlaylist() {
  const addTrackMutation = useAddTrackMutation();
  const { showToast } = useAudio();

  const addTrackToPlaylist = useCallback(async (track, targetPlaylist, options = {}) => {
    const { silent = false } = options;
    if (!track || !targetPlaylist) return { success: false, reason: 'INVALID_INPUT' };

    // 1. 현재 트랙이 이미 해당 플레이리스트에 속해있는 경우 사전 차단
    if (track.playlist_id && String(track.playlist_id) === String(targetPlaylist.id)) {
      if (!silent) {
        showToast(`'${targetPlaylist.title}' 플레이리스트에 이미 추가된 곡입니다.`);
      }
      return { success: false, reason: 'ALREADY_EXISTS' };
    }

    try {
      let videoId = track.youtube_video_id 
        || track.videoId 
        || (typeof track.id === 'string' && !track.id.startsWith('tr-') && track.id.length === 11 ? track.id : '');
      const title = track.custom_title || track.title || '유튜브 동영상';
      const artist = track.custom_artist || track.artist || '알 수 없는 아티스트';

      if (!videoId) {
        const query = track.searchQuery || `${title} ${artist}`;
        try {
          const results = await searchYoutube(query);
          if (results && results.length > 0) {
            videoId = results[0].youtube_video_id || results[0].id || '';
          }
        } catch (searchErr) {
          console.warn('YouTube search failed during playlist add:', searchErr);
        }
      }

      const insertedTrack = await addTrackMutation.mutateAsync({
        playlistId: targetPlaylist.id,
        videoId: videoId || '',
        title,
        artist,
        durationSec: track.durationSec || track.duration || 0,
      });

      if (!silent) {
        showToast(`'${targetPlaylist.title}' 플레이리스트에 추가되었습니다.`);
      }
      window.dispatchEvent(new Event('tracks-updated'));
      return { success: true, data: insertedTrack };
    } catch (err) {
      if (err?.code === 'ALREADY_EXISTS' || err?.code === '23505' || err?.message === 'ALREADY_EXISTS') {
        if (!silent) {
          showToast(`'${targetPlaylist.title}' 플레이리스트에 이미 추가된 곡입니다.`);
        }
        return { success: false, reason: 'ALREADY_EXISTS' };
      }
      console.error('Failed to add track to playlist:', err);
      if (!silent) {
        showToast('플레이리스트 추가에 실패했습니다.');
      }
      return { success: false, reason: 'ERROR', error: err };
    }
  }, [addTrackMutation, showToast]);

  return {
    addTrackToPlaylist,
    isPending: addTrackMutation.isPending,
  };
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

export function useClearPlaylistTracksMutation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ playlistId }) => {
      if (user && !user.isGuest && supabase && UUID_REGEX.test(playlistId)) {
        const { error } = await supabase
          .from('tracks')
          .delete()
          .eq('playlist_id', playlistId);
        if (error) throw error;
      } else {
        const localTr = localStorage.getItem('sofar_tracks');
        const tracks = localTr ? JSON.parse(localTr) : [];
        const updated = tracks.filter(t => t.playlist_id !== playlistId);
        localStorage.setItem('sofar_tracks', JSON.stringify(updated));
      }
      return { playlistId };
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

