import React, { createContext, useContext, useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { normalizeNickname } from '../utils/userProfile';

const AuthContext = createContext(null);

// Supabase 환경변수가 없을 경우에 대비한 안전 장치
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showMigrationModal, setShowMigrationModal] = useState(false);
  const [pendingGuestData, setPendingGuestData] = useState(null);

  useEffect(() => {
    if (!supabase) {
      console.warn('Supabase URL/Key가 설정되지 않아 데모용 Local Storage 모드로 실행됩니다.');
      // 임시 로컬 게스트 유저 설정
      const mockUser = {
        id: 'guest-id-12345',
        email: 'guest@sofar.app',
        user_metadata: {
          full_name: '게스트 리스너'
        },
        isGuest: true
      };
      setUser(mockUser);
      setLoading(false);
      return;
    }

    // 1. 세션 가져오기
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user || null);
      setLoading(false);
      
      if (session?.user) {
        checkLocalDataMigration();
      }
    });

    // 2. 인증 상태 변화 리스너
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user || null);
      setLoading(false);

      if (session?.user) {
        checkLocalDataMigration();
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  // 샘플 데이터가 아닌 실제 사용자 정의 게스트 데이터가 있는지 검사하여 임시 백업 수행
  const backupGuestDataIfNeeded = () => {
    const localPlaylists = localStorage.getItem('sofar_playlists');
    const localTracks = localStorage.getItem('sofar_tracks');

    if (!localPlaylists) return;

    try {
      const playlists = JSON.parse(localPlaylists);
      if (playlists.length === 0) return;

      // 오직 하나의 플레이리스트가 존재하고, 그 플레이리스트가 샘플 플레이리스트('sample-pl')이며,
      // 등록된 곡도 오직 샘플 트랙('sample-tr-1') 하나뿐인지 확인합니다.
      let isOnlySampleData = false;
      if (playlists.length === 1 && playlists[0].id === 'sample-pl') {
        if (!localTracks) {
          isOnlySampleData = true;
        } else {
          const tracks = JSON.parse(localTracks);
          if (tracks.length === 0 || (tracks.length === 1 && tracks[0].id === 'sample-tr-1')) {
            isOnlySampleData = true;
          }
        }
      }

      // 샘플 데이터가 아닌 사용자만의 커스텀 데이터가 존재할 때만 백업 진행
      if (!isOnlySampleData) {
        localStorage.setItem('sofar_guest_playlists', localPlaylists);
        if (localTracks) {
          localStorage.setItem('sofar_guest_tracks', localTracks);
        }
      }
    } catch (e) {
      console.error('Failed to parse local playlist/track data for migration check:', e);
    }
  };

  // 로컬에 이전 게스트 플레이리스트/트랙이 있는지 확인
  const checkLocalDataMigration = () => {
    const localPlaylists = localStorage.getItem('sofar_guest_playlists');
    const localTracks = localStorage.getItem('sofar_guest_tracks');

    if (localPlaylists && JSON.parse(localPlaylists).length > 0) {
      setPendingGuestData({
        playlists: JSON.parse(localPlaylists),
        tracks: localTracks ? JSON.parse(localTracks) : []
      });
      setShowMigrationModal(true);
    }
  };

  // 구글 소셜 로그인
  const loginWithGoogle = async () => {
    if (!supabase) {
      alert('Supabase 연동이 활성화되지 않아 게스트 모드로만 이용 가능합니다. (.env 설정을 확인해주세요.)');
      return { error: new Error('Supabase not active') };
    }
    
    // 로그인 시점 이전에 로컬 스토리지에 있던 게스트 플레이리스트/트랙을 임시로 백업
    backupGuestDataIfNeeded();

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`
      }
    });

    if (error) {
      console.error('Google Login Error:', error);
      return { error };
    }
    return { error: null };
  };

  // 이메일 회원가입
  const signUpWithEmail = async (email, password, displayName) => {
    if (!supabase) return { error: new Error('Supabase not active') };

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: displayName || email.split('@')[0],
        }
      }
    });

    if (!error && data?.user) {
      // profiles 테이블에 유저 정보 등록 (이메일 인증 전이라도 upsert)
      await supabase.from('profiles').upsert({
        id: data.user.id,
        username: displayName || email.split('@')[0],
        email: data.user.email,
        updated_at: new Date().toISOString()
      });
    }

    return { data, error };
  };

  // 이메일 로그인
  const loginWithEmail = async (email, password) => {
    if (!supabase) return { error: new Error('Supabase not active') };

    // 로그인 시점 이전에 로컬 스토리지에 있던 게스트 플레이리스트/트랙을 임시로 백업
    backupGuestDataIfNeeded();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (!error && data?.user) {
      checkLocalDataMigration();
    }

    return { data, error };
  };

  // 비밀번호 재설정 이메일 발송
  const resetPassword = async (email) => {
    if (!supabase) return { error: new Error('Supabase not active') };

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    });

    return { error };
  };

  // 새 비밀번호로 업데이트 실행 (비밀번호 재설정 완료 처리)
  const updatePassword = async (newPassword) => {
    if (!supabase) return { error: new Error('Supabase not active') };

    const { data, error } = await supabase.auth.updateUser({
      password: newPassword
    });

    return { data, error };
  };

  // 비밀번호 변경용 해시 토큰 검증 실행 (사용자 세션 획득용)
  const verifyRecoveryToken = async (tokenHash) => {
    if (!supabase) return { error: new Error('Supabase not active') };

    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'recovery'
    });

    return { data, error };
  };

  // 이메일 OTP 인증 (회원가입 확인 코드 검증)
  const verifyEmailOtp = async (email, token) => {
    if (!supabase) return { error: new Error('Supabase not active') };

    // 가입 완료 전 게스트 데이터를 임시로 백업
    backupGuestDataIfNeeded();

    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'signup'
    });

    if (!error && data?.user) {
      // profiles 테이블 upsert (인증 성공 시점에 확정 등록)
      await supabase.from('profiles').upsert({
        id: data.user.id,
        username: data.user.user_metadata?.full_name || data.user.email.split('@')[0],
        email: data.user.email,
        updated_at: new Date().toISOString()
      });
      checkLocalDataMigration();
    }

    return { data, error };
  };

  // 로그아웃 (또는 게스트 세션 초기화)
  const logout = async () => {
    localStorage.removeItem('sofar_queue');
    if (!user || user.isGuest) {
      localStorage.removeItem('sofar_playlists');
      localStorage.removeItem('sofar_tracks');
      localStorage.removeItem('sofar_playlist_authors');
      localStorage.removeItem('sofar_playlist_covers');
      localStorage.removeItem('sofar_shared_playlist_ids');
      localStorage.removeItem('sofar_guest_playlists');
      localStorage.removeItem('sofar_guest_tracks');
    }
    if (supabase) {
      await supabase.auth.signOut();
    } else {
      // 로컬 디버깅용 로그아웃
      setUser(null);
    }
    window.location.reload();
  };

  // 데이터 마이그레이션 실행
  const executeMigration = async () => {
    if (!user || !pendingGuestData || !supabase) return;

    try {
      const { playlists, tracks } = pendingGuestData;

      // 1. 프로필이 없을 때만 만든다 (이미 있으면 사용자가 바꾼 닉네임을 덮어쓰지 않음)
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          username: normalizeNickname(user.user_metadata.display_name || user.user_metadata.full_name) || '소파 사용자',
          avatar_url: user.user_metadata.avatar_url || '',
          email: user.email,
          updated_at: new Date().toISOString()
        }, { onConflict: 'id', ignoreDuplicates: true });
      
      if (profileError) throw profileError;

      // 2. 각 플레이리스트를 생성하고, 연결된 트랙들을 맵핑하여 업서트
      for (const playlist of playlists) {
        const { data: newPlaylist, error: plError } = await supabase
          .from('playlists')
          .insert({
            user_id: user.id,
            title: playlist.title,
            created_at: playlist.created_at || new Date().toISOString()
          })
          .select()
          .single();

        if (plError) throw plError;

        // 해당 플레이리스트의 기존 트랙 필터링
        const relatedTracks = tracks.filter(t => t.playlist_id === playlist.id);
        
        if (relatedTracks.length > 0) {
          const formattedTracks = relatedTracks.map(t => ({
            playlist_id: newPlaylist.id,
            youtube_video_id: t.youtube_video_id,
            custom_title: t.custom_title,
            custom_artist: t.custom_artist,
            lyric_offset: t.lyric_offset || 0,
            custom_lyrics: t.custom_lyrics || '',
            sequence: t.sequence || 0
          }));

          const { error: trError } = await supabase
            .from('tracks')
            .insert(formattedTracks);

          if (trError) throw trError;
        }
      }

      // 성공 시 백업 데이터 완전 삭제
      localStorage.removeItem('sofar_guest_playlists');
      localStorage.removeItem('sofar_guest_tracks');
      
      // 병합 완료 시 로컬 플레이리스트 캐시 비우기 (서버 데이터와 꼬이지 않도록)
      localStorage.removeItem('sofar_playlists');
      localStorage.removeItem('sofar_tracks');

      // React Query 캐시 무효화 (사이드바 및 홈 피드 즉시 갱신)
      await queryClient.invalidateQueries({ queryKey: ['playlists'] });
      await queryClient.invalidateQueries({ queryKey: ['playlist-previews'] });
      await queryClient.invalidateQueries({ queryKey: ['tracks'] });
      await queryClient.invalidateQueries({ queryKey: ['homeFeed'] });

      alert('로그인 전에 듣던 플레이리스트를 성공적으로 가져왔어요!');
      window.dispatchEvent(new Event('playlists-updated'));
    } catch (err) {
      console.error('Migration Failed:', err);
      alert('플레이리스트를 가져오는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setShowMigrationModal(false);
      setPendingGuestData(null);
    }
  };

  // 데이터 이관 거절 및 게스트 임시 백업/로컬 데이터 완전 삭제
  const discardMigration = () => {
    const confirmDiscard = window.confirm(
      '로그인 전에 담아둔 음악 목록이 모두 삭제됩니다.\n정말로 건너뛰시겠습니까?'
    );
    if (!confirmDiscard) return;

    localStorage.removeItem('sofar_guest_playlists');
    localStorage.removeItem('sofar_guest_tracks');
    localStorage.removeItem('sofar_playlists');
    localStorage.removeItem('sofar_tracks');
    localStorage.removeItem('sofar_playlist_authors');
    localStorage.removeItem('sofar_playlist_covers');
    localStorage.removeItem('sofar_shared_playlist_ids');
    setShowMigrationModal(false);
    setPendingGuestData(null);
  };

  // 닉네임 / 프로필 이미지 수정 (profiles + auth user_metadata 동시 갱신)
  // avatarUrl: 문자열이면 변경, null이면 기본 아바타로 되돌림, undefined면 유지
  const updateProfile = async ({ nickname, avatarUrl } = {}) => {
    if (!supabase || !user || user.isGuest) return { error: new Error('로그인이 필요합니다.') };

    const metaPatch = {};
    const profilePatch = { id: user.id, email: user.email, updated_at: new Date().toISOString() };
    const cleanName = nickname !== undefined ? normalizeNickname(nickname) : undefined;
    if (cleanName !== undefined) {
      metaPatch.display_name = cleanName;
      profilePatch.username = cleanName;
    }
    if (avatarUrl !== undefined) {
      metaPatch.custom_avatar_url = avatarUrl || null;
      profilePatch.avatar_url = avatarUrl || '';
    }

    const { error: profileError } = await supabase.from('profiles').upsert(profilePatch);
    if (profileError) return { error: profileError };

    const { data, error } = await supabase.auth.updateUser({ data: metaPatch });
    if (error) return { error };
    if (data?.user) setUser(data.user);

    // 내 플레이리스트에 표시되는 작성자 이름도 맞춰 줌 (익명 표시 중이면 유지)
    if (nickname !== undefined) {
      await supabase
        .from('playlists')
        .update({ author: cleanName })
        .eq('user_id', user.id)
        .or('author.is.null,author.neq."익명의 리스너"');
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      queryClient.invalidateQueries({ queryKey: ['homeFeed'] });
    }
    return { error: null };
  };

  // 프로필 이미지 업로드 → 공개 URL 반환 (avatars/{userId}/avatar-{ts}.ext)
  const uploadAvatar = async (file) => {
    if (!supabase || !user || user.isGuest) return { error: new Error('로그인이 필요합니다.') };
    const ext = (file.name?.split('.').pop() || 'png').toLowerCase();
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, file, { cacheControl: '3600', upsert: true, contentType: file.type });
    if (error) return { error };

    // 이전 이미지 정리 (실패해도 무시)
    try {
      const { data: list } = await supabase.storage.from('avatars').list(user.id);
      const stale = (list || [])
        .map((f) => `${user.id}/${f.name}`)
        .filter((p) => p !== path);
      if (stale.length) await supabase.storage.from('avatars').remove(stale);
    } catch { /* noop */ }

    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    return { url: data.publicUrl, error: null };
  };

  // 계정 탈퇴: API 서버가 service role로 데이터 + auth.users까지 완전 삭제 (F-AUTH-05)
  const withdrawAccount = async () => {
    if (!supabase || !user || user.isGuest) return { error: new Error('로그인이 필요합니다.') };

    const { data: { session: current } } = await supabase.auth.getSession();
    const token = current?.access_token;
    if (!token) return { error: new Error('세션이 만료되었습니다. 다시 로그인해 주세요.') };

    const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    try {
      const res = await fetch(`${backendUrl}/api/me`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || '탈퇴 처리 중 문제가 발생했습니다.');
      }
    } catch (err) {
      console.error('Withdraw Error:', err);
      return { error: err };
    }

    await supabase.auth.signOut().catch(() => {});
    localStorage.clear();
    return { error: null };
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      loading,
      loginWithGoogle,
      loginWithEmail,
      signUpWithEmail,
      resetPassword,
      updatePassword,
      verifyRecoveryToken,
      verifyEmailOtp,
      logout,
      isSupabaseActive: !!supabase,
      showMigrationModal,
      setShowMigrationModal,
      pendingGuestData,
      executeMigration,
      discardMigration,
      withdrawAccount,
      updateProfile,
      uploadAvatar
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
