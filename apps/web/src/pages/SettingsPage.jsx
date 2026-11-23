import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play, Type, MonitorPlay, Lock, Database, UserRound, Info,
  LogOut, KeyRound, Trash2, ExternalLink, Mail, ChevronRight,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAudio } from '../contexts/AudioContext';
import { useSettings, useAccountPreferences, ANONYMOUS_AUTHOR } from '../hooks/useSettings';
import { usePlaylistsQuery, usePlaylistPreviewsQuery } from '../hooks/usePlaylists';
import { useFavoritesQuery } from '../hooks/useFavorites';
import { Button, Input, Modal, Select } from '../components/ui';
import { useDemographics, birthYearOptions, GENDER_OPTIONS } from '../hooks/useDemographics';
import { supabase } from '../contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { getUserDisplayName, getUserProvider } from '../utils/userProfile';
import './AccountPages.css';

const APP_VERSION = '1.0.0';
const CONTACT_EMAIL = import.meta.env.VITE_CONTACT_EMAIL || 'support@croni.com';
const WITHDRAW_PHRASE = '탈퇴';

const CACHE_LOCAL_KEYS = [
  'sofar_duration_cache',
  'sofar_itunes_thumbnail_cache_v3',
  'sofar_itunes_duration_cache_v1',
];
const CACHE_SESSION_PREFIXES = ['sofar_search_cache_', 'sofar_lyrics_cache_'];
const PLAYBACK_STATE_KEYS = [
  'sofar_current_time', 'sofar_current_duration', 'sofar_playlist', 'sofar_queue',
  'sofar_current_track', 'sofar_playing_source', 'sofar_playback_context',
];

function bytesOf(str) {
  return str ? new Blob([str]).size : 0;
}

function measureCacheBytes() {
  let total = 0;
  try {
    CACHE_LOCAL_KEYS.forEach((k) => { total += bytesOf(localStorage.getItem(k)); });
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (CACHE_SESSION_PREFIXES.some((p) => key?.startsWith(p))) total += bytesOf(sessionStorage.getItem(key));
    }
  } catch { /* noop */ }
  return total;
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/* ── 공통 컨트롤 ─────────────────────────────── */
function Toggle({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`acct-toggle ${checked ? 'is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="acct-toggle-thumb" />
    </button>
  );
}

function Segmented({ value, options, onChange, label }) {
  return (
    <div className="acct-segmented" role="radiogroup" aria-label={label}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          className={`acct-segment ${value === opt.value ? 'is-active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Row({ title, desc, children, danger }) {
  return (
    <div className={`setting-row ${danger ? 'is-danger' : ''}`}>
      <div className="setting-row-text">
        <span className="setting-row-title">{title}</span>
        {desc && <span className="setting-row-desc">{desc}</span>}
      </div>
      <div className="setting-row-control">{children}</div>
    </div>
  );
}

function Section({ id, icon, title, children }) {
  return (
    <section className="setting-section" id={`settings-${id}`} data-section={id}>
      <h2 className="setting-section-title">
        <span className="setting-section-icon">{icon}</span>
        {title}
      </h2>
      <div className="acct-card setting-card">{children}</div>
    </section>
  );
}

/* ── 비밀번호 변경 모달 ──────────────────────── */
function PasswordModal({ isOpen, onClose }) {
  const { updatePassword } = useAuth();
  const { showToast } = useAudio();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) { setPw(''); setPw2(''); setError(''); }
  }, [isOpen]);

  const submit = async (e) => {
    e.preventDefault();
    if (pw.length < 8) return setError('비밀번호는 8자 이상이어야 합니다.');
    if (pw !== pw2) return setError('두 비밀번호가 일치하지 않습니다.');
    setSaving(true);
    const { error: err } = await updatePassword(pw);
    setSaving(false);
    if (err) {
      setError(err.message?.includes('different') ? '지금 쓰는 비밀번호와 다른 비밀번호를 입력해 주세요.' : '비밀번호를 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    showToast('비밀번호를 변경했습니다');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="비밀번호 변경">
      <form className="acct-modal-form" onSubmit={submit}>
        <Input type="password" label="새 비밀번호" placeholder="8자 이상" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" autoFocus />
        <Input type="password" label="새 비밀번호 확인" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" error={error} />
        <div className="acct-modal-actions">
          <Button variant="secondary" onClick={onClose}>취소</Button>
          <Button variant="primary" type="submit" loading={saving}>변경</Button>
        </div>
      </form>
    </Modal>
  );
}

/* ── 회원 탈퇴 모달 ──────────────────────────── */
function WithdrawModal({ isOpen, onClose, counts }) {
  const { withdrawAccount } = useAuth();
  const [phrase, setPhrase] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (isOpen) { setPhrase(''); setError(''); }
  }, [isOpen]);

  const confirm = async () => {
    setWorking(true);
    const { error: err } = await withdrawAccount();
    if (err) {
      setWorking(false);
      setError(err.message || '탈퇴 처리 중 문제가 발생했습니다.');
      return;
    }
    window.location.replace('/');
  };

  return (
    <Modal isOpen={isOpen} onClose={working ? () => {} : onClose} title="회원 탈퇴">
      <div className="acct-modal-form">
        <p className="withdraw-lead">탈퇴하면 아래 데이터가 즉시 삭제되며, 다시 되돌릴 수 없습니다.</p>
        <ul className="withdraw-list">
          <li>플레이리스트 <strong>{counts.playlists}개</strong>와 담은 곡 <strong>{counts.tracks}곡</strong></li>
          <li>좋아요한 곡 <strong>{counts.favorites}곡</strong></li>
          <li>공유한 플레이리스트 링크 (더 이상 열리지 않습니다)</li>
          <li>프로필 이미지, 닉네임, 가사 싱크 조절값 등 계정 설정</li>
        </ul>
        <Input
          label={`계속하려면 ‘${WITHDRAW_PHRASE}’라고 입력해 주세요`}
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          error={error}
          disabled={working}
        />
        <div className="acct-modal-actions">
          <Button variant="secondary" onClick={onClose} disabled={working}>취소</Button>
          <Button variant="danger" onClick={confirm} loading={working} disabled={phrase.trim() !== WITHDRAW_PHRASE}>
            탈퇴하기
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ── 페이지 ──────────────────────────────────── */
export default function SettingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, logout } = useAuth();
  const { currentTrack, showToast } = useAudio();
  const { settings, setSetting, resetSettings } = useSettings();
  const { preferences, isAvailable: hasAccountPrefs, updatePreferences } = useAccountPreferences();
  const demographics = useDemographics();
  const yearOptions = useMemo(() => birthYearOptions(), []);
  const { data: playlists = [] } = usePlaylistsQuery();
  const { data: previews = {} } = usePlaylistPreviewsQuery();
  const { data: favorites = [] } = useFavoritesQuery();

  const isGuest = !user || user.isGuest;
  const provider = getUserProvider(user);
  const [cacheBytes, setCacheBytes] = useState(() => measureCacheBytes());
  const [pwOpen, setPwOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('playback');
  const pageRef = useRef(null);

  const counts = useMemo(() => ({
    playlists: playlists.length,
    tracks: Object.values(previews).reduce((s, l) => s + l.length, 0),
    favorites: favorites.length,
  }), [playlists, previews, favorites]);

  const sections = [
    { id: 'playback', label: '재생', icon: <Play size={15} /> },
    { id: 'lyrics', label: '가사', icon: <Type size={15} /> },
    { id: 'display', label: '화면', icon: <MonitorPlay size={15} /> },
    ...(!isGuest ? [{ id: 'privacy', label: '공개 · 개인정보', icon: <Lock size={15} /> }] : []),
    { id: 'data', label: '데이터', icon: <Database size={15} /> },
    { id: 'account', label: '계정', icon: <UserRound size={15} /> },
    { id: 'about', label: '정보', icon: <Info size={15} /> },
  ];

  const jumpLockRef = useRef(0);

  // 타이틀과 목차가 처음 놓인 높이를 재서 그대로 고정 (스크롤 시 위치가 튀지 않도록)
  // 메뉴로 이동한 섹션 제목도 같은 높이에 맞춤
  useEffect(() => {
    const page = pageRef.current;
    const root = page?.closest('.right-main-content');
    const nav = page?.querySelector('.settings-nav');
    const title = page?.querySelector('.acct-page-header');
    if (!root || !nav || !title) return undefined;
    // sticky를 잠시 풀고 원래 자리의 높이를 잼
    const naturalTop = (el) => {
      const prev = el.style.position;
      el.style.position = 'static';
      const top = el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
      el.style.position = prev;
      return Math.round(top);
    };
    const measure = () => {
      page.style.setProperty('--settings-title-top', `${naturalTop(title)}px`);
      page.style.setProperty('--settings-nav-top', `${naturalTop(nav)}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, []);

  // 스크롤 위치에 맞춰 왼쪽 목차 강조
  useEffect(() => {
    const root = pageRef.current?.closest('.right-main-content');
    if (!root) return undefined;
    // 화면 위쪽 기준선을 지난 마지막 섹션을 강조하고,
    // 끝까지 내리면 (마지막 섹션들은 기준선까지 올라오지 못하므로) 마지막 섹션을 강조
    const update = () => {
      if (Date.now() < jumpLockRef.current) return;
      const els = [...root.querySelectorAll('.setting-section')];
      if (!els.length) return;
      if (root.scrollTop <= 4) {
        setActiveSection(els[0].dataset.section);
        return;
      }
      const atBottom = root.scrollTop + root.clientHeight >= root.scrollHeight - 4;
      if (atBottom) {
        setActiveSection(els[els.length - 1].dataset.section);
        return;
      }
      // 기준선: 섹션 제목이 멈추는 위치(사이드바 시작 높이) 바로 아래
      const rootRect = root.getBoundingClientRect();
      const navTop = parseFloat(
        getComputedStyle(pageRef.current || root).getPropertyValue('--settings-nav-top'),
      ) || 160;
      const line = rootRect.top + navTop + 120;
      let current = els[0];
      els.forEach((el) => {
        if (el.getBoundingClientRect().top <= line) current = el;
      });
      setActiveSection(current.dataset.section);
    };
    update();
    root.addEventListener('scroll', update, { passive: true });
    return () => root.removeEventListener('scroll', update);
  }, [isGuest]);

  const jumpTo = (id) => {
    // 클릭한 항목을 바로 강조하고, 스크롤 애니메이션 동안에는 자동 강조를 멈춤
    // (맨 아래 섹션은 끝까지 올라오지 못해 자동 강조가 바로 위 섹션에 머무르기 때문)
    setActiveSection(id);
    jumpLockRef.current = Date.now() + 1000;
    // 첫 섹션은 맨 위로 이동해 헤더 블러가 생기지 않게 함
    if (id === sections[0].id) {
      pageRef.current?.closest('.right-main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    document.getElementById(`settings-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const savePref = async (patch, okMsg) => {
    try {
      await updatePreferences(patch);
      if (okMsg) showToast(okMsg);
    } catch {
      showToast('설정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
  };

  const saveDemographics = async (patch) => {
    try {
      await demographics.save(patch);
      showToast('저장했습니다');
    } catch (e) {
      showToast(e?.message || '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
  };

  // 닉네임 표시 설정: 이미 만든 플레이리스트의 작성자 이름도 함께 바꿈
  const toggleShowNickname = async (show) => {
    await savePref({ showNicknameOnShared: show });
    if (supabase && user && !isGuest) {
      await supabase
        .from('playlists')
        .update({ author: show ? getUserDisplayName(user) : ANONYMOUS_AUTHOR })
        .eq('user_id', user.id);
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      queryClient.invalidateQueries({ queryKey: ['homeFeed'] });
    }
    showToast(show ? '공유 플레이리스트에 닉네임을 표시합니다' : `공유 플레이리스트에 ‘${ANONYMOUS_AUTHOR}’로 표시됩니다`);
  };

  const clearRecentSearches = () => {
    try { localStorage.removeItem('sofar_recent_searches'); } catch { /* noop */ }
    showToast('최근 검색 기록을 삭제했습니다');
  };

  const clearCache = () => {
    try {
      CACHE_LOCAL_KEYS.forEach((k) => localStorage.removeItem(k));
      const sessionKeys = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (CACHE_SESSION_PREFIXES.some((p) => key?.startsWith(p))) sessionKeys.push(key);
      }
      sessionKeys.forEach((k) => sessionStorage.removeItem(k));
    } catch { /* noop */ }
    setCacheBytes(measureCacheBytes());
    showToast('캐시를 비웠습니다');
  };

  const clearMatchFeedback = () => {
    try { localStorage.removeItem('sofar_voted_match_videos'); } catch { /* noop */ }
    showToast('음원 일치 피드백 기록을 초기화했습니다. 새로고침하면 다시 표시됩니다.');
  };

  const resetPlaybackState = () => {
    if (!window.confirm('대기열과 지금 재생 중인 곡 정보를 비우시겠습니까?\n플레이리스트와 좋아요는 그대로 유지됩니다.')) return;
    try { PLAYBACK_STATE_KEYS.forEach((k) => localStorage.removeItem(k)); } catch { /* noop */ }
    window.location.reload();
  };

  const resetDeviceSettings = () => {
    resetSettings();
    showToast('이 기기의 설정을 기본값으로 되돌렸습니다');
  };

  return (
    <div ref={pageRef} className={`acct-page settings-page scrollbar-none ${currentTrack ? 'has-player' : ''}`}>
      <header className="acct-page-header">
        <h1 className="acct-page-title">설정</h1>
      </header>

      <div className="settings-layout">
        <nav className="settings-nav" aria-label="설정 목차">
          {sections.map((s) => (
            <button
              key={s.id}
              className={`settings-nav-item ${activeSection === s.id ? 'is-active' : ''}`}
              onClick={() => jumpTo(s.id)}
            >
              {s.icon}
              <span>{s.label}</span>
            </button>
          ))}
        </nav>

        <div className="settings-content">
          <Section id="playback" icon={<Play size={16} />} title="재생">
            <Row title="앱을 열 때 반복 모드" desc="‘마지막 설정’을 선택하면 지난번에 쓰던 반복 모드를 그대로 사용합니다.">
              <Segmented
                label="앱을 열 때 반복 모드"
                value={settings.startupRepeatMode}
                onChange={(v) => setSetting('startupRepeatMode', v)}
                options={[
                  { value: 'keep', label: '마지막 설정' },
                  { value: 'none', label: '반복 안 함' },
                  { value: 'all', label: '전체' },
                  { value: 'one', label: '한 곡' },
                ]}
              />
            </Row>
            <Row title="수면 예약 종료 시 페이드아웃" desc="끝나기 30초 전부터 소리를 천천히 줄입니다.">
              <Toggle label="수면 예약 페이드아웃" checked={settings.sleepFadeOut} onChange={(v) => setSetting('sleepFadeOut', v)} />
            </Row>
            <Row title="앱을 다시 열면 이어 듣기" desc="마지막으로 듣던 곡과 위치, 대기열을 그대로 불러옵니다. 다음 실행부터 적용됩니다.">
              <Toggle label="이어 듣기" checked={settings.resumeOnLaunch} onChange={(v) => setSetting('resumeOnLaunch', v)} />
            </Row>
          </Section>

          <Section id="lyrics" icon={<Type size={16} />} title="가사">
            <Row title="앱을 열 때 가사 창" desc="다음 실행부터 적용됩니다.">
              <Segmented
                label="앱을 열 때 가사 창"
                value={settings.startupLyrics}
                onChange={(v) => setSetting('startupLyrics', v)}
                options={[
                  { value: 'keep', label: '마지막 상태' },
                  { value: 'show', label: '보이기' },
                  { value: 'hide', label: '숨기기' },
                ]}
              />
            </Row>
            <Row title="가사 글자 크기">
              <Segmented
                label="가사 글자 크기"
                value={settings.lyricsSize}
                onChange={(v) => setSetting('lyricsSize', v)}
                options={[
                  { value: 'sm', label: '작게' },
                  { value: 'md', label: '보통' },
                  { value: 'lg', label: '크게' },
                ]}
              />
            </Row>
            <Row title="가사를 눌러 그 부분부터 듣기">
              <Toggle label="가사 클릭으로 이동" checked={settings.lyricsClickSeek} onChange={(v) => setSetting('lyricsClickSeek', v)} />
            </Row>
          </Section>

          <Section id="display" icon={<MonitorPlay size={16} />} title="화면 · Now Playing">
            <Row title="앨범 커버 배경" desc="재생 중인 곡의 앨범 커버를 흐리게 처리해 배경으로 보여 줍니다.">
              <Toggle label="앨범 커버 배경" checked={settings.albumBlurBackground} onChange={(v) => setSetting('albumBlurBackground', v)} />
            </Row>
            <Row title="플레이리스트 테마 효과" desc="Now Playing 화면의 눈 · 비 · 벚꽃 같은 효과입니다. 다른 사람의 공유 플레이리스트에도 적용됩니다.">
              <Toggle label="테마 효과" checked={settings.themeEffects} onChange={(v) => setSetting('themeEffects', v)} />
            </Row>
            <Row title="동작 줄이기" desc="LP 회전과 움직이는 효과를 멈춥니다.">
              <Segmented
                label="동작 줄이기"
                value={settings.reduceMotion}
                onChange={(v) => setSetting('reduceMotion', v)}
                options={[
                  { value: 'system', label: '시스템 설정' },
                  { value: 'on', label: '켜기' },
                  { value: 'off', label: '끄기' },
                ]}
              />
            </Row>
          </Section>

          {!isGuest && (
            <Section id="privacy" icon={<Lock size={16} />} title="공개 · 개인정보">
              <Row title="새 플레이리스트 공개" desc="켜면 새로 만드는 플레이리스트가 홈의 공유 목록과 링크로 바로 공개됩니다.">
                <Toggle
                  label="새 플레이리스트 공개"
                  disabled={!hasAccountPrefs}
                  checked={preferences.playlistDefaultPublic}
                  onChange={(v) => savePref({ playlistDefaultPublic: v }, v ? '새 플레이리스트를 공개로 만듭니다' : '새 플레이리스트를 비공개로 만듭니다')}
                />
              </Row>
              <Row title="공유 플레이리스트에 닉네임 표시" desc={`끄면 작성자가 ‘${ANONYMOUS_AUTHOR}’로 표시됩니다.`}>
                <Toggle
                  label="닉네임 표시"
                  disabled={!hasAccountPrefs}
                  checked={preferences.showNicknameOnShared}
                  onChange={toggleShowNickname}
                />
              </Row>
              <Row
                title="출생 연도 (선택)"
                desc="연령대별 통계와 추천 개선에만 쓰이며 다른 사람에게 보이지 않습니다. 만 14세 이상만 입력할 수 있습니다."
              >
                <Select
                  size="sm"
                  className="setting-select"
                  aria-label="출생 연도"
                  disabled={!demographics.isAvailable || demographics.isSaving}
                  value={demographics.birthYear == null ? '' : String(demographics.birthYear)}
                  options={yearOptions}
                  placeholder="선택 안 함"
                  onChange={(e) => saveDemographics({ birthYear: e.target.value ? Number(e.target.value) : null })}
                />
              </Row>
              <Row title="성별 (선택)" desc="성별 통계와 추천 개선에만 쓰이며 다른 사람에게 보이지 않습니다.">
                <Select
                  size="sm"
                  className="setting-select"
                  aria-label="성별"
                  disabled={!demographics.isAvailable || demographics.isSaving}
                  value={demographics.gender || ''}
                  options={GENDER_OPTIONS}
                  placeholder="선택 안 함"
                  onChange={(e) => saveDemographics({ gender: e.target.value || null })}
                />
              </Row>
            </Section>
          )}

          <Section id="data" icon={<Database size={16} />} title="데이터 · 저장공간">
            <Row title="최근 검색 기록">
              <Button variant="secondary" size="sm" onClick={clearRecentSearches}>지우기</Button>
            </Row>
            <Row title="캐시" desc={`썸네일 · 재생 시간 · 검색 결과 · 가사 캐시 (${formatBytes(cacheBytes)})`}>
              <Button variant="secondary" size="sm" onClick={clearCache}>비우기</Button>
            </Row>
            <Row title="음원 일치 피드백 기록" desc="‘노래가 일치하나요?’에 답한 기록을 삭제합니다.">
              <Button variant="secondary" size="sm" onClick={clearMatchFeedback}>초기화</Button>
            </Row>
            <Row title="재생 상태 초기화" desc="대기열과 지금 재생 중인 곡을 비웁니다.">
              <Button variant="secondary" size="sm" onClick={resetPlaybackState}>초기화</Button>
            </Row>
            <Row title="이 기기 설정 초기화" desc="재생 · 가사 · 화면 설정을 기본값으로 되돌립니다.">
              <Button variant="secondary" size="sm" onClick={resetDeviceSettings}>되돌리기</Button>
            </Row>
          </Section>

          <Section id="account" icon={<UserRound size={16} />} title="계정">
            {isGuest ? (
              <Row title="게스트 모드로 이용 중" desc="로그인하면 다른 기기에서도 플레이리스트를 이어 들을 수 있습니다.">
                <Button variant="primary" size="sm" onClick={() => navigate('/login')}>로그인</Button>
              </Row>
            ) : (
              <>
                <Row title="로그인 계정" desc={user?.email}>
                  <span className={`acct-badge ${provider === 'google' ? 'is-google' : ''}`}>
                    {provider === 'google' ? 'Google' : '이메일'}
                  </span>
                </Row>
                <Row title="프로필" desc="닉네임과 프로필 이미지는 내 정보에서 변경할 수 있습니다.">
                  <Button variant="ghost" size="sm" trailingIcon={<ChevronRight size={14} />} onClick={() => navigate('/me')}>내 정보</Button>
                </Row>
                {provider === 'email' && (
                  <Row title="비밀번호">
                    <Button variant="secondary" size="sm" leadingIcon={<KeyRound size={14} />} onClick={() => setPwOpen(true)}>변경</Button>
                  </Row>
                )}
                <Row title="로그아웃">
                  <Button variant="secondary" size="sm" leadingIcon={<LogOut size={14} />} onClick={logout}>로그아웃</Button>
                </Row>
                <Row title="회원 탈퇴" desc="플레이리스트, 좋아요, 계정 정보가 모두 삭제되며 되돌릴 수 없습니다." danger>
                  <Button variant="danger" size="sm" leadingIcon={<Trash2 size={14} />} onClick={() => setWithdrawOpen(true)}>탈퇴</Button>
                </Row>
              </>
            )}
          </Section>

          <Section id="about" icon={<Info size={16} />} title="정보">
            <div className="shortcut-grid">
              {[
                ['Space', '재생 / 일시정지'],
                ['← →', '5초 뒤로 / 앞으로'],
                ['↑ ↓', '볼륨 조절'],
                ['/  ·  ⌘K', '검색'],
                ['Esc', '숨긴 UI 다시 보기'],
              ].map(([key, label]) => (
                <div key={key} className="shortcut-item">
                  <kbd className="shortcut-key">{key}</kbd>
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <Row title="이용약관">
              <a className="acct-link" href="/terms" target="_blank" rel="noreferrer">보기 <ExternalLink size={13} /></a>
            </Row>
            <Row title="개인정보처리방침">
              <a className="acct-link" href="/privacy" target="_blank" rel="noreferrer">보기 <ExternalLink size={13} /></a>
            </Row>
            <Row title="문의 · 피드백" desc={CONTACT_EMAIL}>
              <a className="acct-link" href={`mailto:${CONTACT_EMAIL}`}>메일 보내기 <Mail size={13} /></a>
            </Row>
            <Row title="버전">
              <span className="setting-row-desc">sofar {APP_VERSION}</span>
            </Row>
          </Section>
        </div>
      </div>

      <PasswordModal isOpen={pwOpen} onClose={() => setPwOpen(false)} />
      <WithdrawModal isOpen={withdrawOpen} onClose={() => setWithdrawOpen(false)} counts={counts} />
    </div>
  );
}
