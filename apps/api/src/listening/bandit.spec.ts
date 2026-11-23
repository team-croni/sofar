import {
  allocateSlots,
  betaSample,
  createRng,
  sampleArmThetas,
  spreadEvenly,
} from './bandit';
import { ALGO_BANDIT, recommend, trackKeyOf } from './recommend.engine';

describe('bandit sampling', () => {
  it('draws beta samples around a / (a + b)', () => {
    const rng = createRng('beta');
    let sum = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) sum += betaSample(30, 70, rng);
    expect(sum / n).toBeGreaterThan(0.27);
    expect(sum / n).toBeLessThan(0.33);
  });

  it('is reproducible for the same seed', () => {
    const a = sampleArmThetas({}, createRng('same'));
    const b = sampleArmThetas({}, createRng('same'));
    expect(a).toEqual(b);
  });

  it('favors the arm with a clearly higher reward rate', () => {
    const stats = {
      cooc: { impressions: 500, rewards: 10 },
      similar: { impressions: 500, rewards: 150 },
      artist: { impressions: 500, rewards: 10 },
      popular: { impressions: 500, rewards: 10 },
    };
    let wins = 0;
    for (let i = 0; i < 200; i++) {
      const t = sampleArmThetas(stats, createRng(`r${i}`));
      if (t.similar > Math.max(t.cooc, t.artist, t.popular)) wins += 1;
    }
    expect(wins).toBeGreaterThan(190);
  });
});

describe('allocateSlots', () => {
  it('fills exactly the total and gives every available arm a floor', () => {
    const quotas = allocateSlots(
      24,
      { cooc: 0.01, similar: 0.9, artist: 0.01, popular: 0.01, cf: 0.01 },
      { cooc: 50, similar: 50, artist: 50, popular: 50, cf: 50 },
    );
    const total = Object.values(quotas).reduce((a, b) => a + b, 0);
    expect(total).toBe(24);
    expect(quotas.similar).toBeGreaterThan(quotas.cooc);
    expect(quotas.cooc).toBeGreaterThanOrEqual(1);
    expect(quotas.artist).toBeGreaterThanOrEqual(1);
  });

  it('never assigns more than an arm can provide', () => {
    const quotas = allocateSlots(
      10,
      { cooc: 1, similar: 1, artist: 1, popular: 1, cf: 1 },
      { cooc: 2, similar: 0, artist: 1, popular: 30, cf: 0 },
    );
    expect(quotas.cooc).toBeLessThanOrEqual(2);
    expect(quotas.similar).toBe(0);
    expect(quotas.artist).toBeLessThanOrEqual(1);
    expect(Object.values(quotas).reduce((a, b) => a + b, 0)).toBe(10);
  });
});

describe('spreadEvenly', () => {
  it('interleaves lists instead of stacking one first', () => {
    const out = spreadEvenly([
      ['a1', 'a2', 'a3', 'a4'],
      ['b1', 'b2'],
    ]);
    expect(out.slice(0, 3)).toEqual(['a1', 'b1', 'a2']);
    expect(out).toHaveLength(6);
  });
});

describe('recommend in bandit mode', () => {
  const t = (title: string, artist: string) => ({
    custom_title: title,
    custom_artist: artist,
  });
  const NOW = Date.parse('2026-11-23T12:00:00Z');
  const seed = trackKeyOf(t('Seed', 'A'));
  const history = Array.from({ length: 5 }, (_, i) => ({
    track_key: seed,
    title: 'Seed',
    artist: 'A',
    listened_sec: 200,
    completion: 1,
    end_reason: 'ended',
    started_at: new Date(NOW - (i + 1) * 86400000).toISOString(),
  }));
  const similar = [
    {
      seedKey: seed,
      tracks: Array.from({ length: 20 }, (_, i) => ({
        ...t(`Sim${i}`, `S${i}`),
        match: 1 - i / 40,
      })),
    },
  ];
  const playlists = [
    {
      id: 'pl',
      kind: 'curated' as const,
      title: 'pl',
      tracks: [
        t('Seed', 'A'),
        ...Array.from({ length: 20 }, (_, i) => t(`Co${i}`, `C${i}`)),
      ],
    },
  ];
  const popular = Array.from({ length: 30 }, (_, i) => t(`Pop${i}`, `P${i}`));

  const run = (
    stats: Record<string, { impressions: number; rewards: number }>,
  ) =>
    recommend({
      now: NOW,
      seed: 'user:day',
      history,
      signals: [],
      playlists,
      popular,
      similar,
      bandit: { stats },
      trackLimit: 20,
      playlistLimit: 4,
    });

  it('labels every track with an arm and reports quotas', () => {
    const out = run({});
    expect(out.algo).toBe(ALGO_BANDIT);
    const tracks = out.items.filter((i) => i.type === 'track');
    expect(tracks.length).toBe(20);
    expect(tracks.every((i) => i.arm)).toBe(true);
    expect(out.armQuotas).toBeDefined();
  });

  it('gives more slots to the arm that has been rewarded', () => {
    const strongSimilar = run({
      cooc: { impressions: 800, rewards: 8 },
      similar: { impressions: 800, rewards: 300 },
      artist: { impressions: 800, rewards: 8 },
      popular: { impressions: 800, rewards: 8 },
    });
    const strongCooc = run({
      cooc: { impressions: 800, rewards: 300 },
      similar: { impressions: 800, rewards: 8 },
      artist: { impressions: 800, rewards: 8 },
      popular: { impressions: 800, rewards: 8 },
    });
    const count = (out: ReturnType<typeof run>, arm: string) =>
      out.items.filter((i) => i.type === 'track' && i.arm === arm).length;
    expect(count(strongSimilar, 'similar')).toBeGreaterThan(
      count(strongCooc, 'similar'),
    );
    expect(count(strongCooc, 'cooc')).toBeGreaterThan(
      count(strongSimilar, 'cooc'),
    );
  });
});

describe('recommend with collaborative filtering (cf)', () => {
  const t = (title: string, artist: string) => ({
    custom_title: title,
    custom_artist: artist,
  });
  const NOW = Date.parse('2026-11-24T12:00:00Z');
  const seed = trackKeyOf(t('Seed', 'A'));
  const history = Array.from({ length: 5 }, (_, i) => ({
    track_key: seed,
    title: 'Seed',
    artist: 'A',
    listened_sec: 200,
    completion: 1,
    end_reason: 'ended',
    started_at: new Date(NOW - (i + 1) * 86400000).toISOString(),
  }));

  it('adds tracks other listeners played together as the cf arm', () => {
    const out = recommend({
      now: NOW,
      seed: 'cf-user',
      history,
      signals: [],
      playlists: [],
      popular: Array.from({ length: 10 }, (_, i) => t(`Pop${i}`, `P${i}`)),
      cf: [
        {
          seedKey: seed,
          tracks: Array.from({ length: 8 }, (_, i) => ({
            ...t(`Together${i}`, `T${i}`),
            match: 0.9 - i * 0.05,
          })),
        },
      ],
      bandit: { stats: {} },
      trackLimit: 10,
      playlistLimit: 1,
    });
    const cfItems = out.items.filter(
      (i) => i.type === 'track' && i.arm === 'cf',
    );
    expect(cfItems.length).toBeGreaterThan(0);
    expect(cfItems[0].reason).toBe("'Seed' 리스너들이 함께 들은 곡");
    expect(cfItems.every((i) => (i.features?.cf ?? 0) > 0)).toBe(true);
  });
});
