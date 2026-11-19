import {
  CandidatePlaylist,
  EngineInput,
  engagementOf,
  recommend,
  trackKeyOf,
  withJosa,
} from './recommend.engine';

const NOW = Date.parse('2026-11-20T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW - d * 86400000).toISOString();
const t = (title: string, artist: string) => ({
  custom_title: title,
  custom_artist: artist,
});

const playlists: CandidatePlaylist[] = [
  {
    id: 'indie',
    kind: 'curated',
    title: '인디 감성',
    tracks: [
      t('Seed', 'A'),
      t('Neighbor1', 'B'),
      t('Neighbor2', 'C'),
      t('Neighbor3', 'B'),
      t('Neighbor4', 'B'),
    ],
  },
  {
    id: 'kpop',
    kind: 'curated',
    title: '댄스',
    tracks: [t('Hit1', 'X'), t('Hit2', 'Y'), t('Hit3', 'Z')],
  },
  {
    id: 'mine',
    kind: 'shared',
    title: '내가 만든 것',
    ownerId: 'user-1',
    createdAt: daysAgo(1),
    tracks: [t('Seed', 'A')],
  },
  {
    id: 'fresh',
    kind: 'shared',
    title: '새 공유',
    createdAt: daysAgo(0),
    tracks: [t('Fresh1', 'F')],
  },
];

const base = (over: Partial<EngineInput> = {}): EngineInput => ({
  now: NOW,
  seed: 'test',
  userId: 'user-1',
  history: [],
  signals: [],
  playlists,
  popular: [t('Hit1', 'X'), t('Hit2', 'Y'), t('Hit3', 'Z')],
  ...over,
});

describe('recommend.engine', () => {
  it('uses chart popularity when there is no history (cold start)', () => {
    const out = recommend(base());
    expect(out.coldStart).toBe(true);
    const firstTrack = out.items.find((i) => i.type === 'track');
    expect(firstTrack?.reason).toBe('지금 sofar에서 인기');
  });

  it('recommends tracks that share playlists with what the user loves', () => {
    const history = Array.from({ length: 4 }, (_, i) => ({
      track_key: trackKeyOf(t('Seed', 'A')),
      title: 'Seed',
      artist: 'A',
      listened_sec: 200,
      completion: 1,
      end_reason: 'ended',
      started_at: daysAgo(20 + i),
    }));
    const out = recommend(base({ history }));
    expect(out.coldStart).toBe(false);
    const tracks = out.items
      .filter((i) => i.type === 'track')
      .map((i) => i.itemId);
    expect(tracks[0]).toMatch(/^neighbor/);
    // 같은 아티스트(B)는 2곡까지만
    const bCount = out.items.filter(
      (i) => i.type === 'track' && i.track?.custom_artist === 'B',
    ).length;
    expect(bCount).toBeLessThanOrEqual(2);
    // 자기가 만든 플레이리스트는 추천하지 않고, 새 공유 플레이리스트는 섞는다
    const plIds = out.items
      .filter((i) => i.type === 'playlist')
      .map((i) => i.itemId);
    expect(plIds).not.toContain('mine');
    expect(plIds).toContain('fresh');
    expect(plIds[0]).toBe('indie');
  });

  it('does not recommend recently heard or skipped tracks', () => {
    const history = [
      {
        track_key: trackKeyOf(t('Seed', 'A')),
        title: 'Seed',
        artist: 'A',
        listened_sec: 200,
        completion: 1,
        started_at: daysAgo(1),
      },
      {
        track_key: trackKeyOf(t('Seed', 'A')),
        title: 'Seed',
        artist: 'A',
        listened_sec: 200,
        completion: 1,
        started_at: daysAgo(2),
      },
      {
        track_key: trackKeyOf(t('Hit1', 'X')),
        title: 'Hit1',
        artist: 'X',
        listened_sec: 5,
        is_skip: true,
        started_at: daysAgo(30),
      },
    ];
    const out = recommend(base({ history }));
    const ids = out.items
      .filter((i) => i.type === 'track')
      .map((i) => i.itemId);
    expect(ids).not.toContain(trackKeyOf(t('Seed', 'A')));
    expect(ids).not.toContain(trackKeyOf(t('Hit1', 'X')));
  });

  it('weights completed plays above skips', () => {
    expect(
      engagementOf({ track_key: 'a', started_at: '', is_skip: true }),
    ).toBeLessThan(0);
    expect(
      engagementOf({
        track_key: 'a',
        started_at: '',
        listened_sec: 200,
        completion: 1,
        end_reason: 'ended',
      }),
    ).toBeGreaterThan(1);
  });

  it('ignores tab closes and playback errors instead of penalizing', () => {
    expect(
      engagementOf({
        track_key: 'a',
        started_at: '',
        listened_sec: 11,
        is_skip: true,
        end_reason: 'closed',
      }),
    ).toBeGreaterThanOrEqual(0);
    expect(
      engagementOf({
        track_key: 'a',
        started_at: '',
        listened_sec: 1,
        is_skip: true,
        end_reason: 'error',
      }),
    ).toBe(0);
  });

  it('weights plays by how they started', () => {
    const row = {
      track_key: 'a',
      started_at: '',
      listened_sec: 200,
      completion: 1,
      end_reason: 'ended',
    };
    const search = engagementOf({ ...row, trigger: 'search' });
    const click = engagementOf({ ...row, trigger: 'click' });
    const auto = engagementOf({ ...row, trigger: 'auto' });
    const legacy = engagementOf(row);
    expect(search).toBeGreaterThan(click);
    expect(click).toBeGreaterThan(auto);
    expect(legacy).toBe(click);
    const skip = {
      track_key: 'a',
      started_at: '',
      listened_sec: 5,
      is_skip: true,
      end_reason: 'switched',
    };
    expect(engagementOf({ ...skip, trigger: 'auto' })).toBeGreaterThan(
      engagementOf({ ...skip, trigger: 'click' }),
    );
  });

  it('personalizes from a single meaningful play using similar tracks', () => {
    const seedKey = trackKeyOf(t('TiK ToK', 'Kesha'));
    const history = [
      {
        track_key: seedKey,
        title: 'TiK ToK',
        artist: 'Kesha',
        listened_sec: 57,
        completion: 0.29,
        end_reason: 'switched',
        started_at: daysAgo(0),
      },
    ];
    const out = recommend(
      base({
        history,
        similar: [
          {
            seedKey,
            tracks: [
              { ...t('Die Young', 'Ke$ha'), match: 1 },
              { ...t('Poker Face', 'Lady Gaga'), match: 0.6 },
            ],
          },
        ],
      }),
    );
    expect(out.coldStart).toBe(false);
    const first = out.items.find((i) => i.type === 'track');
    expect(first?.itemId).toBe(trackKeyOf(t('Die Young', 'Ke$ha')));
    expect(first?.reason).toBe("'TiK ToK'과 비슷한 곡");
  });

  it('picks Korean particles by final consonant', () => {
    expect(withJosa("'좋은 날'", '이', '가')).toBe("'좋은 날'이");
    expect(withJosa("'밤편지'", '이', '가')).toBe("'밤편지'가");
    expect(withJosa("'Butter'", '과', '와')).toBe("'Butter'와");
    expect(withJosa("'Spring'", '과', '와')).toBe("'Spring'과");
  });
});
