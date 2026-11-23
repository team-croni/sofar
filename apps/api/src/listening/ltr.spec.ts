import { createRng } from './bandit';
import { LtrRow, aucOf, scoreWithWeights, trainModel } from './ltr';
import { ALGO_LTR, recommend, trackKeyOf } from './recommend.engine';

/**
 * 합성 데이터: 실제로는 '비슷한 곡(sim)'이 감상을 좌우하고 '함께 담김(cooc)'은 오히려 반대인 세상.
 * 앞자리(position 0~2)는 내용과 상관없이 더 잘 눌린다(위치 효과).
 */
function synthetic(n: number, seed = 'ltr'): LtrRow[] {
  const rng = createRng(seed);
  const rows: LtrRow[] = [];
  for (let i = 0; i < n; i++) {
    const f = { cooc: rng(), sim: rng(), artist: rng(), pop: rng() };
    const position = Math.floor(rng() * 24);
    const z =
      -3 + 3.5 * f.sim - 1.5 * f.cooc + 0.5 * f.pop + (position < 3 ? 1.2 : 0);
    const p = 1 / (1 + Math.exp(-z));
    rows.push({
      features: f,
      position,
      label: rng() < p ? 1 : 0,
      viewer_key: `c:viewer${i % 400}`,
    });
  }
  return rows;
}

describe('aucOf', () => {
  it('is 1 for perfect ranking and 0.5-ish for ties', () => {
    expect(aucOf([0.1, 0.2, 0.9, 0.8], [0, 0, 1, 1])).toBe(1);
    expect(aucOf([0.5, 0.5, 0.5, 0.5], [0, 1, 0, 1])).toBe(0.5);
    expect(aucOf([0.1, 0.2], [0, 0])).toBeNull();
  });
});

describe('trainModel', () => {
  it('does not adopt a model when there is too little data', () => {
    const result = trainModel(synthetic(300));
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain('데이터 부족');
  });

  it('learns which signal matters and beats the fixed weights', () => {
    const result = trainModel(synthetic(8000));
    expect(result.accepted).toBe(true);
    const w = result.weights!;
    expect(w.sim).toBeGreaterThan(w.artist);
    expect(w.sim).toBeGreaterThan(0);
    expect(w.cooc).toBeLessThan(0);
    // 위치 효과는 학습에서 따로 잡아낸다 (추천 점수에는 쓰지 않음)
    expect(w.position).toBeGreaterThan(0);
    expect(result.metrics.auc!).toBeGreaterThan(
      result.metrics.baselineAuc! + 0.005,
    );
  });

  it('keeps the current weights when the data has no learnable signal', () => {
    // 여러 시드에서 한 번도 채택되면 안 된다 (우연히 좋아 보이는 것을 걸러야 함)
    for (let k = 0; k < 10; k++) {
      const rng = createRng(`noise${k}`);
      const rows: LtrRow[] = Array.from({ length: 5000 }, (_, i) => ({
        features: { cooc: rng(), sim: rng(), artist: rng(), pop: rng() },
        position: i % 24,
        label: rng() < 0.08 ? 1 : 0,
        viewer_key: `c:v${i % 300}`,
      }));
      expect(trainModel(rows).accepted).toBe(false);
    }
  });

  it('scores without the position term', () => {
    const w = { bias: 0, cooc: 0, sim: 1, artist: 0, pop: 0, position: 5 };
    expect(scoreWithWeights(w, { sim: 0.5 })).toBe(0.5);
  });
});

describe('recommend with learned weights', () => {
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

  it('labels the algorithm and exposes features for serve logging', () => {
    const out = recommend({
      now: NOW,
      seed: 's',
      history,
      signals: [],
      playlists: [
        {
          id: 'pl',
          kind: 'curated',
          title: 'pl',
          tracks: [t('Seed', 'A'), t('Co1', 'C1'), t('Co2', 'C2')],
        },
      ],
      popular: [t('Pop1', 'P1'), t('Pop2', 'P2')],
      similar: [{ seedKey: seed, tracks: [{ ...t('Sim1', 'S1'), match: 1 }] }],
      bandit: { stats: {} },
      learnedWeights: {
        bias: 0,
        cooc: -1,
        sim: 2,
        artist: 0,
        pop: 0,
        position: 0,
      },
      trackLimit: 5,
      playlistLimit: 1,
    });
    expect(out.algo).toBe(ALGO_LTR);
    const tracks = out.items.filter((i) => i.type === 'track');
    expect(
      tracks.every((i) => i.features && typeof i.features.sim === 'number'),
    ).toBe(true);
  });
});
