import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Pencil, LogIn, Heart, ListMusic, Music, Globe, RotateCcw, Settings, AtSign } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAudio } from '../contexts/AudioContext';
import { usePlaylistsQuery, usePlaylistPreviewsQuery } from '../hooks/usePlaylists';
import { useFavoritesQuery } from '../hooks/useFavorites';
import { Avatar, Button, Dropdown, Input, Modal } from '../components/ui';
import SharedPlaylistCard from '../components/home/SharedPlaylistCard';
import { usePlaylistLikeCounts } from '../hooks/usePlaylistLikeCounts';
import SearchTrackRow from '../components/search/SearchTrackRow';
// 홈 인기곡 · 검색 결과와 같은 곡 목록 스타일
import '../components/search/SearchPanel.css';
import {
  getUserDisplayName,
  getUserAvatarUrl,
  getUserProvider,
  validateNickname,
  nicknameErrorMessage,
  normalizeNickname,
  NICKNAME_MAX,
  HANDLE_MAX,
  HANDLE_COOLDOWN_DAYS,
} from '../utils/userProfile';
import { useHandle, useHandleCheck } from '../hooks/useHandle';
import { channelPath } from '../hooks/useChannel';
import { ANONYMOUS_AUTHOR } from '../hooks/useSettings';
import './AccountPages.css';

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

const formatDay = (iso) =>
  new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

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

/* ── 프로필 편집 모달 (닉네임 · 핸들) ───────────────────── */
function EditProfileModal({ isOpen, onClose, user }) {
  const { updateProfile } = useAuth();
  const { showToast } = useAudio();
  const { handle, nextChangeAt, change, isSaving: savingHandle } = useHandle();
  const currentName = getUserDisplayName(user);

  const [name, setName] = useState(currentName);
  const [handleDraft, setHandleDraft] = useState(handle || '');
  const [nameError, setNameError] = useState(null);
  const [handleError, setHandleError] = useState(null);
  const [saving, setSaving] = useState(false);
  const handleLocked = Boolean(nextChangeAt);
  const check = useHandleCheck(handleDraft, handle, isOpen && !handleLocked);

  useEffect(() => {
    if (!isOpen) return;
    setName(currentName);
    setHandleDraft(handle || '');
    setNameError(null);
    setHandleError(null);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const nameChanged = normalizeNickname(name) !== currentName;
  const handleChanged = !handleLocked && check.status !== 'same' && check.status !== 'idle';
  const handleBlocked = handleChanged && check.status !== 'available';

  const submit = async (e) => {
    e.preventDefault();
    if (!nameChanged && !handleChanged) return onClose();
    if (nameChanged) {
      const err = validateNickname(name);
      if (err) return setNameError(err);
    }
    if (handleBlocked) return;

    setSaving(true);
    let ok = true;
    if (nameChanged) {
      const { error } = await updateProfile({ nickname: name });
      if (error) {
        setNameError(nicknameErrorMessage(error));
        ok = false;
      }
    }
    if (ok && handleChanged) {
      try {
        await change(check.handle);
      } catch (err) {
        setHandleError(err.message);
        ok = false;
      }
    }
    setSaving(false);
    if (!ok) return;
    showToast('프로필을 저장했습니다');
    onClose();
  };

  const handleHelper = handleLocked
    ? `${formatDay(nextChangeAt)}부터 다시 바꿀 수 있습니다.`
    : check.status === 'available'
      ? '사용할 수 있는 핸들입니다.'
      : check.status === 'checking'
        ? '확인하는 중…'
        : `영문 소문자·숫자·_·. 3~${HANDLE_MAX}자. 바꾸면 ${HANDLE_COOLDOWN_DAYS}일 동안 다시 바꿀 수 없습니다.`;
  const handleErrorText = handleError
    || (['invalid', 'unavailable', 'error'].includes(check.status) ? check.message : null);

  return (
    <Modal isOpen={isOpen} onClose={saving ? () => {} : onClose} title="프로필 편집">
      <form className="acct-modal-form" onSubmit={submit}>
        <Input
          label="닉네임"
          value={name}
          maxLength={NICKNAME_MAX}
          onChange={(e) => { setName(e.target.value); setNameError(null); }}
          error={nameError}
          helperText={`다른 사람과 같아도 괜찮습니다. ${[...normalizeNickname(name)].length}/${NICKNAME_MAX}`}
          autoFocus
        />
        <Input
          label="핸들"
          className={check.status === 'available' && !handleErrorText ? 'is-available' : ''}
          leadingIcon={<AtSign size={15} />}
          value={handleDraft}
          maxLength={HANDLE_MAX + 1}
          disabled={handleLocked}
          onChange={(e) => { setHandleDraft(e.target.value.replace(/\s/g, '')); setHandleError(null); }}
          error={handleErrorText}
          helperText={handleHelper}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        <div className="acct-modal-actions">
          <Button variant="secondary" onClick={onClose} disabled={saving}>취소</Button>
          <Button
            variant="primary"
            type="submit"
            loading={saving || savingHandle}
            disabled={handleBlocked || (!nameChanged && !handleChanged)}
          >
            저장
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* ── 프로필 카드 ───────────────────────────── */
function ProfileCard({ user }) {
  const { updateProfile, uploadAvatar } = useAuth();
  const { showToast } = useAudio();
  const { handle, isLoading: handleLoading } = useHandle();
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [editOpen, setEditOpen] = useState(false);

  const name = getUserDisplayName(user);
  const avatar = getUserAvatarUrl(user);
  const provider = getUserProvider(user);
  const days = daysSince(user?.created_at);
  const [uploading, setUploading] = useState(false);

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
        <div className="profile-identity">
          <h2 className="profile-name" title={name}>{name}</h2>
          <span className={`profile-handle ${handle ? '' : 'is-placeholder'}`}>
            {handle ? `@${handle}` : handleLoading ? '@…' : ''}
          </span>
        </div>
        <div className="profile-sub">
          <span className={`acct-badge ${provider === 'google' ? 'is-google' : ''}`}>
            {provider === 'google' ? 'Google' : '이메일'}
          </span>
          <span className="profile-email" title={user?.email}>{user?.email}</span>
          {days && (
            <>
              <span className="profile-sub-dot" aria-hidden="true">·</span>
              <span className="profile-since">sofar와 함께한 지 {days.toLocaleString()}일째</span>
            </>
          )}
        </div>
      </div>

      <div className="profile-actions">
        {handle && (
          <Button
            variant="secondary"
            size="sm"
            leadingIcon={<AtSign size={14} />}
            onClick={() => navigate(channelPath(handle))}
          >
            내 채널
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          leadingIcon={<Pencil size={14} />}
          onClick={() => setEditOpen(true)}
        >
          프로필 편집
        </Button>
      </div>

      <EditProfileModal isOpen={editOpen} onClose={() => setEditOpen(false)} user={user} />
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

  // 내 플레이리스트이므로 작성자 아바타·채널은 내 것 (익명으로 표시 중이면 기본 아바타, 채널 링크 없음)
  const myAvatar = getUserAvatarUrl(user);
  const { handle: myHandle } = useHandle();
  const sharedPlaylists = useMemo(
    () => playlists
      .filter((p) => p.is_public)
      .map((p) => ({
        ...p,
        tracks: previews[p.id] || [],
        authorAvatar: p.author === ANONYMOUS_AUTHOR ? null : myAvatar,
        authorHandle: p.author === ANONYMOUS_AUTHOR ? null : myHandle,
      })),
    [playlists, previews, myAvatar, myHandle],
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
