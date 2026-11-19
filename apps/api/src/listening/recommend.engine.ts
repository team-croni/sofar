/**
 * 홈 추천 엔진 (hybrid-v1)
 *
 * 외부 의존성이 없는 순수 함수 모음이다. 서비스는 데이터만 모아 넘기고,
 * 점수 계산은 전부 여기서 한다. 알고리즘을 바꿀 때는 이 파일과 ALGO_VERSION만 바꾼다.
 *
 * 신호
 * 1) 함께 담김: 사용자가 좋아한 곡이 들어 있는 플레이리스트의 다른 곡 (곡 → 플레이리스트 → 곡)
 * 2) 비슷한 곡: 좋아한 곡과 비슷한 곡 (Last.fm 유사곡)
 * 3) 아티스트 취향: 최근에 오래 들은 아티스트일수록 높게
 * 4) 인기도: sofar 실시간 차트 순위
 * 감상 기록이 적을수록 개인화 자리를 줄이고 인기곡으로 채운다. 한 곡만 제대로 들어도 바로 반영된다. 같은 아티스트는 2곡까지만 넣고,
 * 새로 공유된 플레이리스트와 인기곡 몇 개를 섞어 새로운 음악도 만나게 한다.
 */

export const ALGO_VERSION = 'hybrid-v1';

export interface HistoryRow {
  track_key: string;
  title?: string | null;
  artist?: string | null;
  listened_sec?: number | null;
  completion?: number | null;
  is_skip?: boolean | null;
  end_reason?: string | null;
  /** 재생을 시작한 방식: search | click | skip_button | auto | resume (예전 기록은 없음) */
  trigger?: string | null;
  started_at: string;
}

export interface SignalRow {
  title?: string | null;
  artist?: string | null;
  at?: string | null;
  weight: number;
}

export interface CandidateTrack {
  custom_title?: string;
  custom_artist?: string;
  searchQuery?: string;
  [key: string]: unknown;
}

export interface CandidatePlaylist {
  id: string;
  kind: 'curated' | 'shared';
  title: string;
  ownerId?: string | null;
  createdAt?: string | null;
  tracks: CandidateTrack[];
  [key: string]: unknown;
}

export interface SimilarGroup {
  /** 기준이 된 곡의 키 */
  seedKey: string;
  tracks: Array<CandidateTrack & { match?: number }>;
}

export interface Seed {
  key: string;
  title: string;
  artist: string;
  affinity: number;
}

export interface NotInterested {
  tracks: string[];
  playlists: string[];
  artists: string[];
}

export interface PlaylistStats {
  likes: number;
  hypes_14d: number;
  viewers_30d: number;
  listeners_30d: number;
  share_visitors_30d: number;
}

/**
 * 플레이리스트의 사회적 반응 점수.
 * 행동마다 무게를 다르게 주고(응원 > 좋아요 > 실제 감상·공유 유입 > 조회), log로 눌러서
 * 숫자가 큰 소수 플레이리스트가 독식하지 않게 한다. 집계 자체가 '사람 수'라 반복 클릭은 의미가 없다.
 */
export function socialScoreOf(stats?: PlaylistStats): number {
  if (!stats) return 0;
  return Math.log1p(
    5 * stats.hypes_14d +
      3 * stats.likes +
      2 * stats.listeners_30d +
      2 * stats.share_visitors_30d +
      0.5 * stats.viewers_30d,
  );
}

export interface EngineInput {
  now: number;
  /** 같은 날·같은 사용자에게는 같은 결과를 주기 위한 시드 */
  seed: string;
  userId?: string | null;
  history: HistoryRow[];
  /** 즐겨찾기, 내 플레이리스트에 담은 곡 등 감상 외 신호 */
  signals: SignalRow[];
  playlists: CandidatePlaylist[];
  /** 인기 순서대로 정렬된 곡 */
  popular: CandidateTrack[];
  /** 좋아한 곡별 비슷한 곡 (없으면 생략) */
  similar?: SimilarGroup[];
  /** 사용자가 '관심 없음'으로 표시한 곡 키·플레이리스트 ID·아티스트 */
  notInterested?: NotInterested;
  /** 공개 플레이리스트별 반응 집계 (본인 제외, 사람 수 기준) */
  playlistStats?: Record<string, PlaylistStats>;
  trackLimit?: number;
  playlistLimit?: number;
}

export interface RecommendationItem {
  id: string;
  type: 'track' | 'playlist';
  itemId: string;
  playlistKind?: 'curated' | 'shared';
  reason: string;
  score: number;
  track?: CandidateTrack;
  playlist?: CandidatePlaylist;
}

export interface EngineOutput {
  algo: string;
  coldStart: boolean;
  items: RecommendationItem[];
}

const DAY_MS = 24 * 3600 * 1000;
const HALF_LIFE_DAYS = 21;
const MAX_PER_ARTIST = 2;
const COLD_START_MASS = 0.3;

export function normalizeText(value?: string | null): string {
  return (value || '').trim().toLowerCase();
}

/** 차트(chart.service getTrackKey)와 같은 규칙으로 곡 키를 만든다. */
export function trackKeyOf(track: {
  custom_title?: string | null;
  custom_artist?: string | null;
  searchQuery?: string | null;
}): string {
  const title = normalizeText(track.custom_title);
  const artist = normalizeText(track.custom_artist);
  if (title && artist) return `${title}_${artist}`;
  return normalizeText(track.searchQuery);
}

/** 피처링 등을 떼고 주 아티스트만 남긴다. "IU (Feat. X)" → "iu" */
export function artistKeyOf(artist?: string | null): string {
  return normalizeText(artist)
    .replace(/\$/g, 's')
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .split(/,|&| x | feat\.?| ft\.?|\//)[0]
    .trim();
}

/**
 * 같은 노래인지 판단하는 키. 피처링·괄호 표기와 공동 아티스트 차이를 무시한다.
 * "Timber" / "Pitbull & Kesha" 와 "Timber" / "Pitbull" → 같은 노래
 */
export function songIdentityOf(
  title?: string | null,
  artist?: string | null,
): string {
  const t = normalizeText(title)
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return t ? `${t}_${artistKeyOf(artist)}` : '';
}

/**
 * 마지막 글자에 받침이 있는지 판단해 조사를 고른다.
 * withJosa('좋은 날', '이', '가') → '좋은 날이', withJosa('Butter', '와', '과') → 'Butter와'
 */
export function withJosa(
  word: string,
  withBatchim: string,
  withoutBatchim: string,
): string {
  const trimmed = word.replace(/[\s)\]}'"!?.,~]+$/u, '');
  const last = trimmed.charAt(trimmed.length - 1);
  let hasBatchim = false;
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    hasBatchim = (code - 0xac00) % 28 !== 0;
  } else if (/[0-9]/.test(last)) {
    hasBatchim = '013678'.includes(last);
  } else if (/[a-z]/i.test(last)) {
    const lower = trimmed.toLowerCase();
    hasBatchim = /(ng|[lmnkpbt])$/.test(lower);
  }
  return `${word}${hasBatchim ? withBatchim : withoutBatchim}`;
}

/** 시드 문자열로 0~1 사이의 고정 난수를 만든다 (FNV-1a). */
export function seededUnit(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

function decay(ageMs: number): number {
  const days = Math.max(0, ageMs) / DAY_MS;
  return Math.pow(0.5, days / HALF_LIFE_DAYS);
}

/**
 * 재생을 시작한 방식별 무게: 사용자가 직접 고를수록 취향을 더 강하게 반영한다.
 * 자동으로 넘어온 곡도 끝까지 들으면 '싫지 않다'는 신호라 빼지 않고 약하게만 반영한다.
 */
export const TRIGGER_WEIGHT: Record<string, number> = {
  search: 1.3,
  click: 1.0,
  resume: 1.0,
  skip_button: 0.8,
  auto: 0.5,
};

/**
 * 한 번의 재생이 취향에 주는 영향.
 * - 끝까지 들으면 크고, 30초 이상 들으면 최소 0.5
 * - 직접 다음 곡으로 넘긴 경우만 감점 (탭 닫기·재생 오류는 취향이 아니므로 무시)
 *   자동으로 나온 곡을 넘긴 경우는 내가 고른 곡이 아니므로 절반만 감점
 * - 위 값에 재생을 시작한 방식별 무게(TRIGGER_WEIGHT)를 곱한다
 */
export function engagementOf(row: HistoryRow): number {
  if (row.end_reason === 'error') return 0;
  const listened = row.listened_sec || 0;
  if (row.is_skip && (row.end_reason || 'switched') === 'switched') {
    return row.trigger === 'auto' ? -0.15 : -0.3;
  }
  if (listened < 10) return 0;
  const completion =
    typeof row.completion === 'number' && !Number.isNaN(row.completion)
      ? row.completion
      : Math.min(1, listened / 200);
  let value = Math.max(listened >= 30 ? 0.5 : 0.15, Math.min(1, completion));
  if (row.end_reason === 'ended') value += 0.2;
  return value * (TRIGGER_WEIGHT[row.trigger || ''] ?? 1);
}

interface Profile {
  trackAff: Map<string, number>;
  trackTitle: Map<string, string>;
  trackArtist: Map<string, string>;
  artistAff: Map<string, number>;
  artistName: Map<string, string>;
  /** 이미 아는 곡(songIdentityOf 기준): 들은 적 있거나 즐겨찾기·내 플레이리스트에 있는 곡 */
  known: Set<string>;
  positiveMass: number;
}

export function buildProfile(input: EngineInput): Profile {
  const trackAff = new Map<string, number>();
  const trackTitle = new Map<string, string>();
  const trackArtist = new Map<string, string>();
  const artistAff = new Map<string, number>();
  const artistName = new Map<string, string>();
  const known = new Set<string>();
  let positiveMass = 0;

  const add = (
    key: string,
    title: string | null | undefined,
    artist: string | null | undefined,
    weight: number,
  ) => {
    if (!key) return;
    trackAff.set(key, (trackAff.get(key) || 0) + weight);
    if (title && !trackTitle.has(key)) trackTitle.set(key, title);
    if (artist && !trackArtist.has(key)) trackArtist.set(key, artist);
    const aKey = artistKeyOf(artist);
    // 한 곡을 넘겼다고 그 아티스트를 싫어한다고 보지 않는다
    if (aKey && weight > 0) {
      artistAff.set(aKey, (artistAff.get(aKey) || 0) + weight);
      if (artist && !artistName.has(aKey)) artistName.set(aKey, artist.trim());
    }
    if (weight > 0) positiveMass += weight;
  };

  for (const row of input.history) {
    const at = Date.parse(row.started_at);
    const age = Number.isNaN(at) ? 0 : input.now - at;
    const w = decay(age) * engagementOf(row);
    add(row.track_key, row.title, row.artist, w);
    if (engagementOf(row) > 0) {
      known.add(songIdentityOf(row.title, row.artist) || row.track_key);
    }
  }

  for (const signal of input.signals) {
    const key = trackKeyOf({
      custom_title: signal.title,
      custom_artist: signal.artist,
    });
    const at = signal.at ? Date.parse(signal.at) : NaN;
    const w = (Number.isNaN(at) ? 1 : decay(input.now - at)) * signal.weight;
    add(key, signal.title, signal.artist, w);
    const identity = songIdentityOf(signal.title, signal.artist);
    if (identity) known.add(identity);
  }

  // '관심 없음'으로 표시한 곡의 아티스트는 취향 점수를 조금 깎는다
  for (const artist of input.notInterested?.artists || []) {
    const aKey = artistKeyOf(artist);
    if (aKey) artistAff.set(aKey, (artistAff.get(aKey) || 0) - 0.4);
  }

  return {
    trackAff,
    trackTitle,
    trackArtist,
    artistAff,
    artistName,
    known,
    positiveMass,
  };
}

/** 비슷한 곡을 찾을 기준 곡: 취향 점수가 높은 순 */
export function pickSeeds(
  input: Pick<EngineInput, 'now' | 'history' | 'signals'>,
  limit = 5,
): Seed[] {
  const profile = buildProfile({
    ...input,
    seed: '',
    playlists: [],
    popular: [],
  });
  return Array.from(profile.trackAff.entries())
    .filter(
      ([key, aff]) =>
        aff > 0 && profile.trackTitle.has(key) && profile.trackArtist.has(key),
    )
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, affinity]) => ({
      key,
      title: profile.trackTitle.get(key) as string,
      artist: profile.trackArtist.get(key) as string,
      affinity,
    }));
}

function maxPositive(values: Iterable<number>): number {
  let max = 0;
  for (const v of values) if (v > max) max = v;
  return max;
}

interface TrackCandidate {
  key: string;
  track: CandidateTrack;
  artistKey: string;
  cooc: number;
  bestPlaylist?: { rel: number; seedKey?: string };
  sim: number;
  bestSim?: { v: number; seedKey: string };
  personal: number;
  artist: number;
  pop: number;
  score: number;
  reason: string;
}

export function recommend(input: EngineInput): EngineOutput {
  const trackLimit = input.trackLimit ?? 16;
  const playlistLimit = input.playlistLimit ?? 8;
  const profile = buildProfile(input);
  const coldStart = profile.positiveMass < COLD_START_MASS;
  const jitter = (id: string) =>
    (seededUnit(`${input.seed}:${id}`) - 0.5) * 0.08;

  const artistMax = maxPositive(profile.artistAff.values()) || 1;
  const artistScore = (aKey: string) =>
    Math.max(0, profile.artistAff.get(aKey) || 0) / artistMax;

  // 1) 플레이리스트 관련도: 내가 좋아한 곡·아티스트가 얼마나 들어 있는가
  const playlistRel = new Map<string, { rel: number; seedKey?: string }>();
  for (const pl of input.playlists) {
    let seedSum = 0;
    let topSeed: { key: string; aff: number } | undefined;
    const artistsSeen = new Set<string>();
    let artistSum = 0;
    for (const t of pl.tracks) {
      const key = trackKeyOf(t);
      const aff = Math.max(0, profile.trackAff.get(key) || 0);
      if (aff > 0) {
        seedSum += aff;
        if (!topSeed || aff > topSeed.aff) topSeed = { key, aff };
      }
      const aKey = artistKeyOf(t.custom_artist);
      if (aKey && !artistsSeen.has(aKey)) {
        artistsSeen.add(aKey);
        artistSum += artistScore(aKey);
      }
    }
    const size = Math.max(1, pl.tracks.length);
    const rel = (seedSum + 0.5 * artistSum) / Math.sqrt(size);
    playlistRel.set(pl.id, { rel, seedKey: topSeed?.key });
  }

  // 2) 인기도
  const popScore = new Map<string, number>();
  input.popular.forEach((t, i) => {
    const key = trackKeyOf(t);
    if (!key || popScore.has(key)) return;
    popScore.set(key, 1 - i / Math.max(1, input.popular.length));
  });

  // 3) 곡 후보 모으기
  const candidates = new Map<string, TrackCandidate>();
  const touch = (t: CandidateTrack): TrackCandidate | undefined => {
    const key = trackKeyOf(t);
    if (!key) return undefined;
    let c = candidates.get(key);
    if (!c) {
      const artistKey = artistKeyOf(t.custom_artist);
      c = {
        key,
        track: t,
        artistKey,
        cooc: 0,
        sim: 0,
        personal: 0,
        artist: artistScore(artistKey),
        pop: popScore.get(key) || 0,
        score: 0,
        reason: '',
      };
      candidates.set(key, c);
    }
    return c;
  };

  for (const pl of input.playlists) {
    const info = playlistRel.get(pl.id);
    for (const t of pl.tracks) {
      const c = touch(t);
      if (!c || !info) continue;
      c.cooc += info.rel;
      // 자기 자신이 시드인 경우는 이유로 쓰지 않는다
      if (
        info.rel > 0 &&
        info.seedKey &&
        info.seedKey !== c.key &&
        (!c.bestPlaylist || info.rel > c.bestPlaylist.rel)
      ) {
        c.bestPlaylist = info;
      }
    }
  }
  input.popular.forEach((t) => touch(t));

  for (const group of input.similar || []) {
    const seedAff = Math.max(0, profile.trackAff.get(group.seedKey) || 0);
    if (seedAff <= 0) continue;
    for (const t of group.tracks) {
      const c = touch(t);
      if (!c) continue;
      const v = seedAff * (typeof t.match === 'number' ? t.match : 0.5);
      c.sim += v;
      if (!c.bestSim || v > c.bestSim.v)
        c.bestSim = { v, seedKey: group.seedKey };
    }
  }

  const coocMax =
    maxPositive(Array.from(candidates.values(), (c) => c.cooc)) || 1;
  const simMax =
    maxPositive(Array.from(candidates.values(), (c) => c.sim)) || 1;

  for (const c of candidates.values()) {
    const cooc = c.cooc / coocMax;
    const sim = c.sim / simMax;
    if (coldStart) {
      c.score = c.pop + 0.3 * cooc + jitter(c.key);
      c.reason = '지금 sofar에서 인기';
      continue;
    }
    const parts = [
      { kind: 'cooc', v: 0.35 * cooc },
      { kind: 'sim', v: 0.35 * sim },
      { kind: 'artist', v: 0.3 * c.artist },
    ];
    c.personal = parts.reduce((sum, part) => sum + part.v, 0);
    c.score = c.personal + 0.15 * c.pop + jitter(c.key);
    const top = parts.sort((a, b) => b.v - a.v)[0].kind;
    const coocSeed = c.bestPlaylist?.seedKey
      ? profile.trackTitle.get(c.bestPlaylist.seedKey)
      : undefined;
    const simSeed = c.bestSim
      ? profile.trackTitle.get(c.bestSim.seedKey)
      : undefined;
    if (top === 'sim' && simSeed) {
      c.reason = `${withJosa(`'${simSeed}'`, '과', '와')} 비슷한 곡`;
    } else if (top === 'artist' && c.artist > 0 && c.track.custom_artist) {
      const name = profile.artistName.get(c.artistKey) || c.track.custom_artist;
      c.reason = `${name} 노래를 즐겨 들어서`;
    } else if (top === 'cooc' && coocSeed) {
      c.reason = `${withJosa(`'${coocSeed}'`, '과', '와')} 함께 담긴 곡`;
    } else {
      c.reason = '지금 sofar에서 인기';
    }
  }

  // 4) 곡 선택: 이미 아는 곡·넘긴 곡 제외, 아티스트 다양성 유지
  const pickedTracks: TrackCandidate[] = [];
  const perArtist = new Map<string, number>();
  const pickedKeys = new Set<string>();
  const identity = (c: TrackCandidate) =>
    songIdentityOf(c.track.custom_title, c.track.custom_artist) || c.key;
  const hiddenTracks = new Set(input.notInterested?.tracks || []);
  const canPick = (c: TrackCandidate) => {
    if (hiddenTracks.has(c.key)) return false;
    if (pickedKeys.has(identity(c))) return false;
    if (profile.known.has(identity(c))) return false;
    if ((profile.trackAff.get(c.key) || 0) < 0) return false;
    if (c.artistKey && (perArtist.get(c.artistKey) || 0) >= MAX_PER_ARTIST) {
      return false;
    }
    return true;
  };
  const pick = (c: TrackCandidate) => {
    pickedTracks.push(c);
    pickedKeys.add(identity(c));
    if (c.artistKey)
      perArtist.set(c.artistKey, (perArtist.get(c.artistKey) || 0) + 1);
  };

  // 취향 정보가 많을수록 개인화 자리를 늘리고, 나머지는 인기곡으로 채운다
  const personalSlots = coldStart
    ? 0
    : Math.round(trackLimit * Math.min(0.85, 0.4 + profile.positiveMass * 0.2));
  const personalSorted = Array.from(candidates.values())
    .filter((c) => c.personal > 0)
    .sort((a, b) => b.score - a.score);
  for (const c of personalSorted) {
    if (pickedTracks.length >= personalSlots) break;
    if (canPick(c)) pick(c);
  }
  const popularFirst = Array.from(candidates.values())
    .filter((c) => c.pop > 0)
    .sort(
      (a, b) => b.pop + jitter(`p${b.key}`) - (a.pop + jitter(`p${a.key}`)),
    );
  for (const c of popularFirst) {
    if (pickedTracks.length >= trackLimit) break;
    if (canPick(c)) {
      c.reason = '지금 sofar에서 인기';
      pick(c);
    }
  }

  // 5) 플레이리스트 선택
  const relMax =
    maxPositive(Array.from(playlistRel.values(), (v) => v.rel)) || 1;
  const hiddenPlaylists = new Set(input.notInterested?.playlists || []);
  const ownedOut = input.playlists.filter(
    (pl) =>
      pl.tracks.length > 0 &&
      !hiddenPlaylists.has(pl.id) &&
      !(input.userId && pl.ownerId && pl.ownerId === input.userId),
  );
  const statsOf = (pl: CandidatePlaylist) => input.playlistStats?.[pl.id];
  const socialMax =
    maxPositive(ownedOut.map((pl) => socialScoreOf(statsOf(pl)))) || 1;
  const popInPlaylist = (pl: CandidatePlaylist) => {
    let sum = 0;
    for (const t of pl.tracks) sum += popScore.get(trackKeyOf(t)) || 0;
    return sum / Math.sqrt(Math.max(1, pl.tracks.length));
  };
  const popPlMax = maxPositive(ownedOut.map(popInPlaylist)) || 1;

  const scoredPlaylists = ownedOut
    .map((pl) => {
      const info = playlistRel.get(pl.id);
      const rel = (info?.rel || 0) / relMax;
      const pop = popInPlaylist(pl) / popPlMax;
      const social = socialScoreOf(statsOf(pl)) / socialMax;
      const score = coldStart
        ? 0.5 * pop + 0.5 * social + jitter(pl.id) * 3
        : 0.6 * rel + 0.2 * pop + 0.2 * social + jitter(pl.id);
      let reason = '많이 듣는 플레이리스트';
      if (!coldStart && rel > 0.15 && info?.seedKey) {
        const seedTitle = profile.trackTitle.get(info.seedKey);
        if (seedTitle)
          reason = `${withJosa(`'${seedTitle}'`, '이', '가')} 담긴 플레이리스트`;
      } else if (social > 0.6 && (statsOf(pl)?.likes || 0) > 0) {
        reason = '리스너들이 좋아하는 플레이리스트';
      }
      return { pl, score, reason };
    })
    .sort((a, b) => b.score - a.score);

  const pickedPlaylists: {
    pl: CandidatePlaylist;
    score: number;
    reason: string;
  }[] = [];
  const pickedPlIds = new Set<string>();
  // 새로 공유된 플레이리스트 자리: 만든 사람에게도 노출 기회를 준다
  const freshSlots = Math.min(2, Math.max(1, Math.round(playlistLimit * 0.2)));
  for (const s of scoredPlaylists) {
    if (pickedPlaylists.length >= playlistLimit - freshSlots) break;
    pickedPlaylists.push(s);
    pickedPlIds.add(s.pl.id);
  }
  // 응원을 받은 플레이리스트가 먼저, 그다음 최근에 공유된 순
  const fresh = ownedOut
    .filter((pl) => pl.kind === 'shared' && !pickedPlIds.has(pl.id))
    .sort(
      (a, b) =>
        (statsOf(b)?.hypes_14d || 0) - (statsOf(a)?.hypes_14d || 0) ||
        (Date.parse(b.createdAt || '') || 0) -
          (Date.parse(a.createdAt || '') || 0),
    );
  for (const pl of fresh) {
    if (pickedPlaylists.length >= playlistLimit) break;
    const hyped = (statsOf(pl)?.hypes_14d || 0) > 0;
    pickedPlaylists.push({
      pl,
      score: 0,
      reason: hyped
        ? '리스너들이 응원하는 플레이리스트'
        : '새로 공유된 플레이리스트',
    });
    pickedPlIds.add(pl.id);
  }
  for (const s of scoredPlaylists) {
    if (pickedPlaylists.length >= playlistLimit) break;
    if (pickedPlIds.has(s.pl.id)) continue;
    pickedPlaylists.push(s);
    pickedPlIds.add(s.pl.id);
  }

  // 6) 섞어서 내보내기: 플레이리스트 1개 뒤에 곡 2개
  const trackItems: RecommendationItem[] = pickedTracks.map((c) => ({
    id: `track:${c.key}`,
    type: 'track',
    itemId: c.key,
    reason: c.reason,
    score: Number(c.score.toFixed(4)),
    track: c.track,
  }));
  const playlistItems: RecommendationItem[] = pickedPlaylists.map((s) => ({
    id: `${s.pl.kind}:${s.pl.id}`,
    type: 'playlist',
    itemId: s.pl.id,
    playlistKind: s.pl.kind,
    reason: s.reason,
    score: Number(s.score.toFixed(4)),
    playlist: s.pl,
  }));

  const items: RecommendationItem[] = [];
  let ti = 0;
  let pi = 0;
  while (ti < trackItems.length || pi < playlistItems.length) {
    if (pi < playlistItems.length) items.push(playlistItems[pi++]);
    for (let k = 0; k < 2 && ti < trackItems.length; k++)
      items.push(trackItems[ti++]);
  }

  return { algo: ALGO_VERSION, coldStart, items };
}
