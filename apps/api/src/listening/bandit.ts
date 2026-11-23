/**
 * 추천 2단계: Thompson sampling 밴딧
 *
 * 추천 곡을 어느 후보 출처(팔, arm)에서 몇 개 뽑을지를 고정 비율 대신 결과로 정한다.
 * - 팔마다 '노출 대비 보상(눌러서 30초 이상 들음)' 비율을 Beta(1 + 보상, 1 + 노출 - 보상)로 보고
 * - 요청마다 각 팔에서 값을 하나 뽑아(Thompson sampling) 큰 팔에 자리를 더 준다.
 * - 데이터가 적을 때는 분포가 넓어서 여러 팔을 고루 시도하고, 쌓일수록 잘되는 팔로 모인다.
 * 외부 의존성 없는 순수 함수만 둔다.
 */

export const ARMS = ['cooc', 'similar', 'artist', 'popular', 'cf'] as const;
export type Arm = (typeof ARMS)[number];

export interface ArmStats {
  impressions: number;
  rewards: number;
}

/** 시드 문자열 → 32비트 정수 (FNV-1a) */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 시드로 재현 가능한 0~1 난수 생성기 (mulberry32) */
export function createRng(seed: string): () => number {
  let a = hashSeed(seed) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalSample(rng: () => number): number {
  // Box-Muller
  let u = 0;
  while (u === 0) u = rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Gamma(shape, 1) 샘플 (Marsaglia-Tsang) */
export function gammaSample(shape: number, rng: () => number): number {
  if (shape < 1) {
    const u = rng() || 1e-12;
    return gammaSample(shape + 1, rng) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = normalSample(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/** Beta(a, b) 샘플 */
export function betaSample(a: number, b: number, rng: () => number): number {
  const x = gammaSample(a, rng);
  const y = gammaSample(b, rng);
  return x + y === 0 ? 0.5 : x / (x + y);
}

/** 팔마다 보상 비율을 하나씩 뽑는다. 기록이 없는 팔은 Beta(1, 1) = 균등분포. */
export function sampleArmThetas(
  stats: Partial<Record<Arm, ArmStats>>,
  rng: () => number,
): Record<Arm, number> {
  const out = {} as Record<Arm, number>;
  for (const arm of ARMS) {
    const s = stats[arm];
    const impressions = Math.max(0, s?.impressions || 0);
    const rewards = Math.min(impressions, Math.max(0, s?.rewards || 0));
    out[arm] = betaSample(1 + rewards, 1 + impressions - rewards, rng);
  }
  return out;
}

/**
 * 전체 자리 수를 팔별로 나눈다.
 * - weights: 팔별 가중치 (뽑힌 보상 비율 × 개인화 신뢰도 등)
 * - available: 팔별로 실제 고를 수 있는 후보 수 (없으면 자리를 주지 않음)
 * - floor: 후보가 있는 팔은 최소 이 비율만큼 자리를 준다 (계속 시도해 봐야 학습이 됨)
 */
export function allocateSlots(
  total: number,
  weights: Record<Arm, number>,
  available: Record<Arm, number>,
  floor = 0.08,
): Record<Arm, number> {
  const quotas = {
    cooc: 0,
    similar: 0,
    artist: 0,
    popular: 0,
    cf: 0,
  } as Record<Arm, number>;
  const active = ARMS.filter((arm) => available[arm] > 0);
  if (active.length === 0 || total <= 0) return quotas;

  const sum =
    active.reduce((acc, arm) => acc + Math.max(0, weights[arm]), 0) || 1;
  const floorShare = Math.min(floor, 1 / active.length);
  const rest = 1 - floorShare * active.length;
  const shares = active.map((arm) => ({
    arm,
    share: floorShare + rest * (Math.max(0, weights[arm]) / sum),
  }));

  // 큰 나머지 방식으로 정수 자리 배분
  let assigned = 0;
  const fractions = shares.map(({ arm, share }) => {
    const exact = share * total;
    const whole = Math.min(Math.floor(exact), available[arm]);
    quotas[arm] = whole;
    assigned += whole;
    return { arm, frac: exact - Math.floor(exact) };
  });
  fractions.sort((a, b) => b.frac - a.frac);
  let guard = 0;
  while (assigned < total && guard < 1000) {
    guard += 1;
    let progressed = false;
    for (const { arm } of fractions) {
      if (assigned >= total) break;
      if (quotas[arm] < available[arm]) {
        quotas[arm] += 1;
        assigned += 1;
        progressed = true;
      }
    }
    if (!progressed) break;
  }
  return quotas;
}

/**
 * 팔별로 고른 목록을 고르게 섞는다. 한 팔이 앞자리를 독차지하면 위치 효과 때문에
 * 그 팔만 더 눌리는 것처럼 학습되므로, 각 목록을 전체 길이에 고르게 펼쳐 놓는다.
 */
export function spreadEvenly<T>(lists: T[][]): T[] {
  const tagged: Array<{ pos: number; order: number; item: T }> = [];
  let order = 0;
  for (const list of lists) {
    list.forEach((item, i) => {
      tagged.push({ pos: (i + 0.5) / list.length, order: order++, item });
    });
  }
  return tagged
    .sort((a, b) => a.pos - b.pos || a.order - b.order)
    .map((t) => t.item);
}
