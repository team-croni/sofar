import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Pencil, Check, X, LogIn, Heart, ListMusic, Music, Globe, RotateCcw, Settings } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAudio } from '../contexts/AudioContext';
import { usePlaylistsQuery, usePlaylistPreviewsQuery } from '../hooks/usePlaylists';
import { useFavoritesQuery } from '../hooks/useFavorites';
import { Avatar, Button, Dropdown } from '../components/ui';
import SharedPlaylistCard from '../components/home/SharedPlaylistCard';
import { usePlaylistLikeCounts } from '../hooks/usePlaylistLikeCounts';
import SearchTrackRow from '../components/search/SearchTrackRow';
// 홈 인기곡 · 검색 결과와 같은 곡 목록 스타일
import '../components/search/SearchPanel.css';
import { getUserDisplayName, getUserAvatarUrl, getUserProvider, validateNickname, NICKNAME_MAX } from '../utils/userProfile';
import './AccountPages.css';

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

function openPlaylistInSidebar(pl) {
  window.dispatchEvent(new CustomEvent('trigger-open-shared-playlist', {
    detail: { ...pl, _openedAt: Date.now() },
  }));
}

function daysSince(iso) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  return Math.max(1, Math.floor(diff / 86400000) + 1);
}

/* ── 프로필 카드 ───────────────────────────── */
function ProfileCard({ user }) {
  const { updateProfile, uploadAvatar } = useAuth();
  const { showToast } = useAudio();
  const fileRef = useRef(null);

  const name = getUserDisplayName(user);
  const avatar = getUserAvatarUrl(user);
  const provider = getUserProvider(user);
  const days = daysSince(user?.created_at);

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [nameError, setNameError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const startEdit = () => {
    setDraft(name);
    setNameError(null);
    setIsEditing(true);
  };

  const saveNickname = async (e) => {
    e?.preventDefault();
    const err = validateNickname(draft);
    if (err) {
      setNameError(err);
      return;
    }
    if (draft.trim() === name) {
      setIsEditing(false);
      return;
    }
    setSaving(true);
    const { error } = await updateProfile({ nickname: draft });
    setSaving(false);
    if (error) {
      setNameError('닉네임을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    setIsEditing(false);
    showToast('닉네임을 변경했습니다');
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('이미지 파일만 올릴 수 있습니다');
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      showToast('2MB 이하의 이미지를 선택해 주세요');
      return;
    }
    setUploading(true);
    const { url, error } = await uploadAvatar(file);
    if (!error) {
      const res = await updateProfile({ avatarUrl: url });
      if (res.error) showToast('프로필 이미지를 저장하지 못했습니다');
      else showToast('프로필 이미지를 변경했습니다');
    } else {
      showToast('이미지를 올리지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
    setUploading(false);
  };

  const resetAvatar = async () => {
    setUploading(true);
    const { error } = await updateProfile({ avatarUrl: null });
    setUploading(false);
    showToast(error ? '기본 이미지로 되돌리지 못했습니다' : '기본 이미지로 되돌렸습니다');
  };

  return (
    <section className="acct-card profile-card">
      <div className="profile-avatar-wrap">
        <Avatar src={avatar} name={name} size={96} />
        <Dropdown
          align="left"
          trigger={(isOpen) => (
            <button
              className={`profile-avatar-edit ${isOpen ? 'active' : ''}`}
              disabled={uploading}
              title="프로필 이미지 변경"
              aria-label="프로필 이미지 변경"
            >
              {uploading ? <span className="acct-spinner" /> : <Camera size={15} />}
            </button>
          )}
        >
          {(close) => (
            <div>
              <button className="sofar-dropdown-item" onClick={() => { close(); fileRef.current?.click(); }}>
                <Camera size={15} />
                <span>이미지 올리기</span>
              </button>
              {avatar && (
                <button className="sofar-dropdown-item" onClick={() => { close(); resetAvatar(); }}>
                  <RotateCcw size={15} />
                  <span>기본 이미지로 되돌리기</span>
                </button>
              )}
            </div>
          )}
        </Dropdown>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          hidden
          onChange={handleFile}
        />
      </div>

      <div className="profile-meta">
        {isEditing ? (
          <form className="profile-name-form" onSubmit={saveNickname}>
            <input
              className={`profile-name-input ${nameError ? 'has-error' : ''}`}
              value={draft}
              maxLength={NICKNAME_MAX}
              onChange={(e) => { setDraft(e.target.value); setNameError(null); }}
              onKeyDown={(e) => { if (e.key === 'Escape') setIsEditing(false); }}
              aria-label="닉네임"
              autoFocus
            />
            <button type="submit" className="acct-icon-btn" disabled={saving} title="저장" aria-label="저장">
              {saving ? <span className="acct-spinner" /> : <Check size={16} />}
            </button>
            <button type="button" className="acct-icon-btn" onClick={() => setIsEditing(false)} title="취소" aria-label="취소">
              <X size={16} />
            </button>
          </form>
        ) : (
          <div className="profile-name-row">
            <h2 className="profile-name" title={name}>{name}</h2>
            <button className="acct-icon-btn" onClick={startEdit} title="닉네임 수정" aria-label="닉네임 수정">
              <Pencil size={14} />
            </button>
          </div>
        )}
        {nameError && <p className="profile-name-error">{nameError}</p>}

        <div className="profile-sub">
          <span className="profile-email">{user?.email}</span>
          <span className={`acct-badge ${provider === 'google' ? 'is-google' : ''}`}>
            {provider === 'google' ? 'Google 계정' : '이메일 계정'}
          </span>
        </div>
        {days && <p className="profile-since">sofar와 함께한 지 {days.toLocaleString()}일째</p>}
      </div>
    </section>
  );
}

/* ── 보관함 요약 ───────────────────────────── */
function LibraryStats({ playlists, previews, favorites, onOpenFavorites }) {
  const trackCount = Object.values(previews || {}).reduce((sum, list) => sum + list.length, 0);
  const publicCount = playlists.filter((p) => p.is_public).length;

  const stats = [
    { key: 'playlists', label: '플레이리스트', value: playlists.length, icon: <ListMusic size={16} />, onClick: () => window.dispatchEvent(new CustomEvent('trigger-open-playlist-list')) },
    { key: 'tracks', label: '담은 곡', value: trackCount, icon: <Music size={16} /> },
    { key: 'favorites', label: '좋아요한 곡', value: favorites.length, icon: <Heart size={16} />, onClick: onOpenFavorites },
    { key: 'public', label: '공개 플레이리스트', value: publicCount, icon: <Globe size={16} />, onClick: () => document.getElementById('my-shared')?.scrollIntoView({ behavior: 'smooth' }) },
  ];

  return (
    <section className="acct-stats">
      {stats.map((s) => {
        const Tag = s.onClick ? 'button' : 'div';
        return (
          <Tag key={s.key} className={`acct-stat ${s.onClick ? 'is-clickable' : ''}`} onClick={s.onClick}>
            <span className="acct-stat-icon">{s.icon}</span>
            <span className="acct-stat-value">{s.value.toLocaleString()}</span>
            <span className="acct-stat-label">{s.label}</span>
          </Tag>
        );
      })}
    </section>
  );
}

/* ── 게스트 화면 ───────────────────────────── */
function GuestView({ playlists, previews }) {
  const navigate = useNavigate();
  const trackCount = Object.values(previews || {}).reduce((sum, list) => sum + list.length, 0);
  const userPlaylists = playlists.filter((p) => !(p.id === 'sample-pl' && trackCount === 0));

  return (
    <section className="acct-card guest-card">
      <Avatar name="Guest" size={72} />
      <div className="guest-copy">
        <h2 className="profile-name">게스트 모드로 이용 중입니다</h2>
        <p className="guest-desc">
          지금은 이 기기에만 저장됩니다. 로그인하면 다른 기기에서도 플레이리스트를 이어 듣고, 링크로 공유할 수 있습니다.
        </p>
        {(userPlaylists.length > 0 || trackCount > 0) && (
          <p className="guest-local">
            이 기기에 플레이리스트 {playlists.length}개 · 곡 {trackCount}개가 있습니다. 로그인하면 그대로 가져올 수 있습니다.
          </p>
        )}
      </div>
      <Button variant="primary" leadingIcon={<LogIn size={16} />} onClick={() => navigate('/login')}>
        로그인
      </Button>
    </section>
  );
}

/* ── 페이지 ────────────────────────────────── */
export default function MyInfoPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { currentTrack, playTrack, addToQueue, setPlayingSource, showToast } = useAudio();
  const { data: playlists = [] } = usePlaylistsQuery();
  const { data: previews = {} } = usePlaylistPreviewsQuery();
  const { data: favorites = [] } = useFavoritesQuery();
  const isGuest = !user || user.isGuest;
  const hasPlayer = Boolean(currentTrack);

  const sharedPlaylists = useMemo(
    () => playlists
      .filter((p) => p.is_public)
      .map((p) => ({ ...p, tracks: previews[p.id] || [] })),
    [playlists, previews],
  );

  const likeCounts = usePlaylistLikeCounts(sharedPlaylists.map((p) => p.id));

  const recentFavorites = useMemo(
    () => [...favorites]
      .sort((a, b) => new Date(b.favorited_at || 0) - new Date(a.favorited_at || 0))
      .slice(0, 8),
    [favorites],
  );

  const playPlaylist = (pl) => {
    if (!pl.tracks?.length) {
      showToast('플레이리스트에 곡이 없습니다');
      return;
    }
    playTrack(pl.tracks[0], pl.tracks);
    setPlayingSource?.({ type: 'my', playlistId: pl.id });
    openPlaylistInSidebar(pl);
  };

  return (
    <div className={`acct-page myinfo-page scrollbar-none ${hasPlayer ? 'has-player' : ''}`}>
      <header className="acct-page-header">
        <h1 className="acct-page-title">내 정보</h1>
        <Button variant="ghost" size="sm" leadingIcon={<Settings size={15} />} onClick={() => navigate('/settings')}>
          설정
        </Button>
      </header>

      {isGuest ? (
        <GuestView playlists={playlists} previews={previews} />
      ) : (
        <ProfileCard user={user} />
      )}

      <LibraryStats
        playlists={playlists}
        previews={previews}
        favorites={favorites}
        onOpenFavorites={() => document.getElementById('my-favorites')?.scrollIntoView({ behavior: 'smooth' })}
      />

      {!isGuest && (
        <section className="home-section home-section--recommended" id="my-shared">
          <div className="section-header">
            <h3 className="section-title">내가 공유한 플레이리스트</h3>
          </div>
          {sharedPlaylists.length > 0 ? (
            <div className="playlist-folder-grid">
              {sharedPlaylists.map((pl) => (
                <SharedPlaylistCard
                  key={pl.id}
                  likeCount={likeCounts[pl.id] || 0}
                  playlist={pl}
                  onSelectPlaylist={openPlaylistInSidebar}
                  onPlayPlaylist={playPlaylist}
                  onAddPlaylistToQueue={(p) => (p.tracks?.length ? addToQueue(p.tracks, 'end') : showToast('대기열에 추가할 곡이 없습니다'))}
                  canCopyLink
                />
              ))}
            </div>
          ) : (
            <p className="acct-empty">
              아직 공유한 플레이리스트가 없습니다. 사이드바에서 플레이리스트 메뉴의 ‘공유하기’를 눌러 보세요.
            </p>
          )}
        </section>
      )}

      <section className="home-section" id="my-favorites">
        <div className="section-header">
          <h3 className="section-title">최근 좋아요한 곡</h3>
        </div>
        {recentFavorites.length > 0 ? (
          <div className="popular-list">
            {recentFavorites.map((track, idx) => (
              <SearchTrackRow
                key={track.id || idx}
                track={track}
                index={idx + 1}
                contextList={recentFavorites}
              />
            ))}
          </div>
        ) : (
          <p className="acct-empty">재생 바의 하트 버튼을 누르면 좋아요한 곡이 여기에 모입니다.</p>
        )}
      </section>
    </div>
  );
}
