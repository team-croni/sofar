/**
 * 추천 3단계: 점수 가중치 학습 (learning to rank, 로지스틱 회귀)
 *
 * 지금까지는 사람이 정한 가중치(함께 담김 0.35, 비슷함 0.35, 아티스트 0.3, 인기 0.15)로 점수를 냈다.
 * 여기서는 '보여 준 곡을 눌러 30초 이상 들었는가'를 정답으로 그 가중치를 직접 학습한다.
 *
 * - 위치 보정: 앞자리일수록 눌리기 쉬우므로 위치를 학습 입력에만 넣고, 추천할 때는 빼서
 *   "같은 자리에 놓였다면 얼마나 잘 들릴까"로 순서를 정한다.
 * - 검증: 사람 단위로 학습/검증을 나눠(같은 사람이 양쪽에 섞이지 않게) 기존 고정 가중치보다
 *   검증 AUC가 확실히 좋을 때만 새 가중치를 채택한다.
 * 외부 의존성 없는 순수 함수만 둔다.
 */
import { hashSeed } from './bandit';

export const LTR_FEATURES = ['cooc', 'sim', 'artist', 'pop'] as const;
export type LtrFeature = (typeof LTR_FEATURES)[number];
export type LtrFeatureValues = Record<LtrFeature, number>;

export interface LtrWeights {
  bias: number;
  cooc: number;
  sim: number;
  artist: number;
  pop: number;
  /** 학습할 때만 쓰는 위치 효과 (추천 점수에는 쓰지 않음) */
  position: number;
}

export interface LtrRow {
  features: Partial<LtrFeatureValues>;
  position: number;
  label: number;
  viewer_key: string;
}

export interface TrainOptions {
  epochs?: number;
  learningRate?: number;
  l2?: number;
  minSamples?: number;
  minPositives?: number;
  /** 기존 가중치보다 검증 AUC가 이만큼은 높아야 채택 */
  minAucGain?: number;
}

export interface TrainResult {
  accepted: boolean;
  reason: string;
  weights: LtrWeights | null;
  metrics: {
    samples: number;
    positives: number;
    trainSamples: number;
    validSamples: number;
    auc: number | null;
    baselineAuc: number | null;
    logloss: number | null;
  };
}

/** hybrid-v1/v2가 쓰는 고정 가중치 (비교 기준) */
export const BASELINE_WEIGHTS: LtrWeights = {
  bias: 0,
  cooc: 0.35,
  sim: 0.35,
  artist: 0.3,
  pop: 0.15,
  position: 0,
};

const clamp01 = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
};

/** 위치 효과: 0번 자리에서 가장 크고 뒤로 갈수록 완만하게 줄어든다 */
const positionFeature = (position: number) =>
  1 / Math.log2(2 + Math.max(0, position));

/** 추천 점수 (위치 제외). 로지스틱의 로짓이라 크기 비교만 하면 된다. */
export function scoreWithWeights(
  w: LtrWeights,
  f: Partial<LtrFeatureValues>,
): number {
  return (
    w.bias +
    w.cooc * clamp01(f.cooc) +
    w.sim * clamp01(f.sim) +
    w.artist * clamp01(f.artist) +
    w.pop * clamp01(f.pop)
  );
}

const sigmoid = (z: number) =>
  1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));

function trainLogistic(
  rows: LtrRow[],
  opts: Required<TrainOptions>,
): LtrWeights {
  const w: LtrWeights = {
    bias: 0,
    cooc: 0,
    sim: 0,
    artist: 0,
    pop: 0,
    position: 0,
  };
  // 정답이 드물어서(대부분 0) 양성에 가중치를 줘 학습이 '전부 0'으로 쏠리지 않게 한다
  const positives = rows.filter((r) => r.label === 1).length;
  const posWeight =
    positives > 0 ? Math.min(20, (rows.length - positives) / positives) : 1;
  for (let epoch = 0; epoch < opts.epochs; epoch++) {
    const lr = opts.learningRate / (1 + epoch * 0.05);
    const grad: LtrWeights = {
      bias: 0,
      cooc: 0,
      sim: 0,
      artist: 0,
      pop: 0,
      position: 0,
    };
    let total = 0;
    for (const r of rows) {
      const x = {
        cooc: clamp01(r.features.cooc),
        sim: clamp01(r.features.sim),
        artist: clamp01(r.features.artist),
        pop: clamp01(r.features.pop),
        position: positionFeature(r.position),
      };
      const z =
        w.bias +
        w.cooc * x.cooc +
        w.sim * x.sim +
        w.artist * x.artist +
        w.pop * x.pop +
        w.position * x.position;
      const sampleWeight = r.label === 1 ? posWeight : 1;
      const err = (sigmoid(z) - r.label) * sampleWeight;
      grad.bias += err;
      grad.cooc += err * x.cooc;
      grad.sim += err * x.sim;
      grad.artist += err * x.artist;
      grad.pop += err * x.pop;
      grad.position += err * x.position;
      total += sampleWeight;
    }
    const n = total || 1;
    w.bias -= lr * (grad.bias / n);
    for (const k of ['cooc', 'sim', 'artist', 'pop', 'position'] as const) {
      w[k] -= lr * (grad[k] / n + opts.l2 * w[k]);
    }
  }
  return w;
}

/**
 * AUC의 표준오차 (Hanley & McNeil 1982).
 * 양성(감상)이 적으면 우연만으로도 AUC가 크게 흔들리므로, 채택 기준에 이 오차를 반영한다.
 */
export function aucStandardError(
  auc: number,
  positives: number,
  negatives: number,
): number {
  if (positives <= 0 || negatives <= 0) return Infinity;
  const q1 = auc / (2 - auc);
  const q2 = (2 * auc * auc) / (1 + auc);
  const variance =
    (auc * (1 - auc) +
      (positives - 1) * (q1 - auc * auc) +
      (negatives - 1) * (q2 - auc * auc)) /
    (positives * negatives);
  return Math.sqrt(Math.max(0, variance));
}

/** AUC: 양성이 음성보다 높은 점수를 받을 확률 (0.5 = 무작위) */
export function aucOf(scores: number[], labels: number[]): number | null {
  const pairs = scores.map((s, i) => ({ s, y: labels[i] }));
  const pos = pairs.filter((p) => p.y === 1).length;
  const neg = pairs.length - pos;
  if (pos === 0 || neg === 0) return null;
  pairs.sort((a, b) => a.s - b.s);
  let rankSum = 0;
  let i = 0;
  while (i < pairs.length) {
    let j = i;
    while (j + 1 < pairs.length && pairs[j + 1].s === pairs[i].s) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) if (pairs[k].y === 1) rankSum += avgRank;
    i = j + 1;
  }
  return (rankSum - (pos * (pos + 1)) / 2) / (pos * neg);
}

/** 학습하고, 기존 가중치보다 확실히 나을 때만 채택 */
export function trainModel(
  rows: LtrRow[],
  options: TrainOptions = {},
): TrainResult {
  const opts: Required<TrainOptions> = {
    epochs: options.epochs ?? 300,
    learningRate: options.learningRate ?? 1.5,
    l2: options.l2 ?? 0.001,
    minSamples: options.minSamples ?? 2000,
    minPositives: options.minPositives ?? 50,
    minAucGain: options.minAucGain ?? 0.005,
  };
  const positives = rows.filter((r) => r.label === 1).length;
  const base = {
    samples: rows.length,
    positives,
    trainSamples: 0,
    validSamples: 0,
    auc: null as number | null,
    baselineAuc: null as number | null,
    logloss: null as number | null,
  };
  if (rows.length < opts.minSamples || positives < opts.minPositives) {
    return {
      accepted: false,
      reason: `데이터 부족 (노출 ${rows.length}/${opts.minSamples}, 감상 ${positives}/${opts.minPositives})`,
      weights: null,
      metrics: base,
    };
  }

  // 사람 단위로 20%를 검증용으로 뗀다
  const isValid = (r: LtrRow) => hashSeed(`ltr:${r.viewer_key}`) % 5 === 0;
  const train = rows.filter((r) => !isValid(r));
  const valid = rows.filter(isValid);
  const weights = trainLogistic(train, opts);

  const labels = valid.map((r) => r.label);
  const auc = aucOf(
    valid.map((r) => scoreWithWeights(weights, r.features)),
    labels,
  );
  const baselineAuc = aucOf(
    valid.map((r) => scoreWithWeights(BASELINE_WEIGHTS, r.features)),
    labels,
  );
  let ll = 0;
  for (const r of valid) {
    const p = sigmoid(
      scoreWithWeights(weights, r.features) +
        weights.position * positionFeature(r.position),
    );
    ll -= r.label * Math.log(p + 1e-9) + (1 - r.label) * Math.log(1 - p + 1e-9);
  }
  const metrics = {
    ...base,
    trainSamples: train.length,
    validSamples: valid.length,
    auc,
    baselineAuc,
    logloss: valid.length ? ll / valid.length : null,
  };
  const round = (v: number) => Math.round(v * 10000) / 10000;
  const rounded = Object.fromEntries(
    Object.entries(weights).map(([k, v]) => [k, round(v)]),
  ) as unknown as LtrWeights;

  if (auc === null || baselineAuc === null) {
    return {
      accepted: false,
      reason: '검증 데이터에 감상/비감상이 모두 있어야 합니다',
      weights: rounded,
      metrics,
    };
  }
  // 우연으로 설명되지 않을 만큼(약 95% 신뢰) 좋아졌을 때만 채택한다.
  // 두 AUC는 같은 데이터에서 나와 실제 차이의 오차는 이보다 작지만, 보수적으로 둘의 오차를 합쳐 본다.
  const validPos = labels.filter((y) => y === 1).length;
  const validNeg = labels.length - validPos;
  const diffError = Math.sqrt(
    aucStandardError(auc, validPos, validNeg) ** 2 +
      aucStandardError(baselineAuc, validPos, validNeg) ** 2,
  );
  const requiredGain = Math.max(opts.minAucGain, 1.96 * diffError);
  // 학습한 가중치 자체도 무작위(0.5)보다 확실히 나아야 한다
  const learnedError = aucStandardError(auc, validPos, validNeg);
  if (auc - 1.96 * learnedError <= 0.5) {
    return {
      accepted: false,
      reason: `학습한 가중치가 무작위보다 확실히 낫지 않음 (AUC ${auc.toFixed(3)} ± ${(1.96 * learnedError).toFixed(3)})`,
      weights: rounded,
      metrics,
    };
  }
  if (auc < baselineAuc + requiredGain) {
    return {
      accepted: false,
      reason: `기존 가중치보다 확실히 낫지 않음 (AUC ${auc.toFixed(3)} vs ${baselineAuc.toFixed(3)}, 필요 차이 ${requiredGain.toFixed(3)})`,
      weights: rounded,
      metrics,
    };
  }
  return { accepted: true, reason: '채택', weights: rounded, metrics };
}
