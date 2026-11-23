import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  Brain,
  Loader2,
  MousePointerClick,
  RefreshCw,
  Share2,
  Headphones,
  AlertTriangle,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import { Button, KpiCard } from '../components/ui';
import { useAdmin } from '../context/AdminContext';
import { useToast } from '../context/ToastContext';
import './RecommendationPage.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// 버전마다 색을 고정한다 (순위·필터와 상관없이 같은 버전은 같은 색)
const VARIANTS = {
  'hybrid-v1': { label: 'v1 고정 가중치', color: '#3987e5' },
  'hybrid-v2-bandit': { label: 'v2 밴딧', color: '#d95926' },
  'hybrid-v3-ltr': { label: 'v3 밴딧 + 학습', color: '#199e70' },
  'cold-start': { label: '새 방문자 (인기 위주)', color: '#c98500' },
};
const VARIANT_ORDER = Object.keys(VARIANTS);

const ARM_LABELS = {
  cooc: '함께 담긴 곡',
  similar: '비슷한 곡 (Last.fm)',
  artist: '자주 듣는 아티스트',
  cf: '함께 들은 곡',
  popular: '인기곡',
};

const MIN_SAMPLE = 300;
const LTR_MIN_SAMPLES = 2000;
const LTR_MIN_POSITIVES = 50;

/** 비율의 95% 신뢰구간 (Wilson). 표본이 적을 때 비율이 과장되지 않게 범위를 함께 보여 준다 */
function wilson(successes, total) {
  if (!total) return null;
  const z = 1.96;
  const p = successes / total;
  const denom = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) / denom;
  return { p, low: Math.max(0, center - half), high: Math.min(1, center + half) };
}

const pct = (v, digits = 1) => (v == null ? '-' : `${(v * 100).toFixed(digits)}%`);
const num = (v) => (v || 0).toLocaleString();
const fmtDate = (v) => (v ? new Date(v).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }) : '-');

function RateCell({ successes, total }) {
  const ci = wilson(successes, total);
  if (!ci) return <span className="rec-muted">-</span>;
  return (
    <span className="rec-rate">
      <span>{pct(ci.p)}</span>
      <span className="rec-rate-ci">
        {pct(ci.low)} ~ {pct(ci.high)}
      </span>
    </span>
  );
}

function Progress({ value, max, label }) {
  const ratio = Math.min(1, (value || 0) / max);
  return (
    <div className="rec-progress">
      <div className="rec-progress-head">
        <span>{label}</span>
        <span className="rec-num">
          {num(value)} / {num(max)}
        </span>
      </div>
      <div className="rec-progress-track" role="progressbar" aria-valuenow={value} aria-valuemax={max}>
        <div className="rec-progress-fill" style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

/** 일별 '30초 이상 감상률' 꺾은선 (버전별). 호버하면 그날 모든 버전 값을 보여 준다 */
function DailyRateChart({ daily }) {
  const [hover, setHover] = useState(null);
  const { days, series, maxRate } = useMemo(() => {
    // 노출이 없는 날도 가로축에 남겨 날짜 간격이 그대로 보이게 한다
    const present = Array.from(new Set(daily.map((d) => d.day))).sort();
    const daySet = [];
    if (present.length) {
      const end = new Date(`${present[present.length - 1]}T00:00:00Z`);
      for (let t = new Date(`${present[0]}T00:00:00Z`); t <= end; t.setUTCDate(t.getUTCDate() + 1)) {
        daySet.push(t.toISOString().slice(0, 10));
      }
    }
    const byVariant = {};
    for (const d of daily) {
      const key = VARIANTS[d.variant] ? d.variant : null;
      if (!key) continue;
      (byVariant[key] ||= {})[d.day] = d;
    }
    const list = VARIANT_ORDER.filter((v) => byVariant[v]).map((v) => ({
      variant: v,
      points: daySet.map((day) => {
        const row = byVariant[v][day];
        return row && row.impressions > 0
          ? { day, rate: row.good_plays / row.impressions, impressions: row.impressions, good: row.good_plays }
          : { day, rate: null };
      }),
    }));
    const max = Math.max(0.05, ...list.flatMap((s) => s.points.map((p) => p.rate || 0)));
    return { days: daySet, series: list, maxRate: Math.ceil(max * 20) / 20 };
  }, [daily]);

  if (days.length === 0) {
    return <p className="rec-empty">아직 집계할 추천 노출이 없습니다.</p>;
  }

  const W = 720;
  const H = 240;
  const pad = { l: 44, r: 120, t: 12, b: 28 };
  const x = (i) => pad.l + (days.length === 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (days.length - 1));
  const y = (r) => pad.t + (1 - r / maxRate) * (H - pad.t - pad.b);
  const ticks = [0, maxRate / 2, maxRate];
  // 오른쪽 끝 직접 라벨이 겹치지 않게 세로로 최소 13px 간격을 둔다
  const labelY = {};
  series
    .map((s) => {
      const i = s.points.map((p) => p.rate != null).lastIndexOf(true);
      return i < 0 ? null : { variant: s.variant, y: y(s.points[i].rate) + 4 };
    })
    .filter(Boolean)
    .sort((a, b) => a.y - b.y)
    .forEach((l, k, arr) => {
      if (k > 0) l.y = Math.max(l.y, arr[k - 1].y + 13);
      // 아래로 밀려 날짜 라벨과 겹치면 전체를 위로 올린다
      if (k === arr.length - 1) {
        const overflow = l.y - (H - pad.b);
        arr.forEach((a) => {
          if (overflow > 0) a.y -= overflow;
          labelY[a.variant] = a.y;
        });
      }
    });

  const handleMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    days.forEach((_, i) => {
      if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    });
    setHover(best);
  };

  return (
    <div className="rec-chart">
      <div className="rec-legend" aria-hidden="true">
        {series.map((s) => (
          <span key={s.variant} className="rec-legend-item">
            <span className="rec-legend-swatch" style={{ background: VARIANTS[s.variant].color }} />
            {VARIANTS[s.variant].label}
          </span>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="rec-chart-svg"
        role="img"
        aria-label="버전별 일별 30초 이상 감상률"
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="rec-grid" />
            <text x={pad.l - 8} y={y(t) + 4} className="rec-axis" textAnchor="end">
              {pct(t, 0)}
            </text>
          </g>
        ))}
        {days.map((day, i) =>
          i === 0 || i === days.length - 1 || days.length <= 7 ? (
            <text key={day} x={x(i)} y={H - 8} className="rec-axis" textAnchor="middle">
              {day.slice(5)}
            </text>
          ) : null,
        )}
        {hover != null && (
          <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} className="rec-crosshair" />
        )}
        {series.map((s) => {
          const color = VARIANTS[s.variant].color;
          // 값이 없는 날은 선을 끊는다
          const segments = [];
          let current = [];
          s.points.forEach((p, i) => {
            if (p.rate == null) {
              if (current.length) segments.push(current);
              current = [];
            } else current.push(`${x(i)},${y(p.rate)}`);
          });
          if (current.length) segments.push(current);
          const lastIndex = s.points.map((p) => p.rate != null).lastIndexOf(true);
          return (
            <g key={s.variant}>
              {segments.map((seg, k) =>
                seg.length > 1 ? (
                  <polyline key={k} points={seg.join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
                ) : null,
              )}
              {s.points.map((p, i) =>
                p.rate != null && (hover === i || segments.some((seg) => seg.length === 1 && seg[0] === `${x(i)},${y(p.rate)}`)) ? (
                  <circle key={i} cx={x(i)} cy={y(p.rate)} r="4" fill={color} stroke="#161415" strokeWidth="2" />
                ) : null,
              )}
              {lastIndex >= 0 && (
                <text x={x(lastIndex) + 8} y={labelY[s.variant]} className="rec-direct-label">
                  {VARIANTS[s.variant].label.split(' ')[0]} {pct(s.points[lastIndex].rate)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div
          className="rec-tooltip"
          style={{ left: `${(x(hover) / W) * 100}%` }}
          role="status"
        >
          <div className="rec-tooltip-title">{days[hover]}</div>
          {series.map((s) => {
            const p = s.points[hover];
            return (
              <div key={s.variant} className="rec-tooltip-row">
                <span className="rec-legend-swatch" style={{ background: VARIANTS[s.variant].color }} />
                <span>{VARIANTS[s.variant].label}</span>
                <span className="rec-num">
                  {p.rate == null ? '노출 없음' : `${pct(p.rate)} (${num(p.good)}/${num(p.impressions)})`}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function RecommendationPage() {
  const { adminKey } = useAdmin();
  const { showSuccessToast, showErrorToast } = useToast();
  const queryClient = useQueryClient();
  const [days, setDays] = useState(14);
  const [busy, setBusy] = useState(null);

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: ['rec-dashboard', days, adminKey],
    enabled: Boolean(adminKey),
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/recommend/dashboard?days=${days}`, {
        headers: { 'x-admin-key': adminKey },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });

  const runAction = async (kind) => {
    setBusy(kind);
    try {
      const path = kind === 'train' ? 'recommend/model/train' : 'recommend/neighbors/rebuild';
      const res = await fetch(`${API_BASE}/api/${path}`, {
        method: 'POST',
        headers: { 'x-admin-key': adminKey },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || `HTTP ${res.status}`);
      if (kind === 'train') {
        const r = json.result || {};
        if (r.accepted) showSuccessToast(`새 가중치를 켰습니다 (${r.version || ''})`, '학습 완료');
        else showSuccessToast(r.reason || '기존 가중치를 유지합니다', '학습 결과');
      } else if (json.rebuilt) {
        showSuccessToast(`이웃 ${num(json.rows)}개를 다시 계산했습니다`, '계산 완료');
      } else {
        showErrorToast(json.error || '다시 계산하지 못했습니다');
      }
      queryClient.invalidateQueries({ queryKey: ['rec-dashboard'] });
    } catch (e) {
      showErrorToast(e.message || '요청을 처리하지 못했습니다');
    } finally {
      setBusy(null);
    }
  };

  const variants = useMemo(
    () =>
      [...(data?.variants || [])].sort(
        (a, b) => VARIANT_ORDER.indexOf(a.variant) - VARIANT_ORDER.indexOf(b.variant),
      ),
    [data],
  );
  const totals = variants.reduce(
    (acc, v) => ({
      impressions: acc.impressions + v.impressions,
      clicks: acc.clicks + v.clicks,
      good: acc.good + v.good_plays,
    }),
    { impressions: 0, clicks: 0, good: 0 },
  );
  const activeModel = (data?.models || []).find((m) => m.active);
  const served = data?.served7d || {};
  const servedTotal = Object.values(served).reduce((a, b) => a + b, 0);
  const training = data?.training || { samples: 0, positives: 0 };

  const headerActions = (
    <div className="rec-header-actions">
      <div className="rec-segment" role="group" aria-label="집계 기간">
        {[7, 14, 30].map((d) => (
          <button
            key={d}
            type="button"
            className={`rec-segment-btn ${days === d ? 'active' : ''}`}
            onClick={() => setDays(d)}
            aria-pressed={days === d}
          >
            {d}일
          </button>
        ))}
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => refetch()}
        leadingIcon={isFetching ? <Loader2 size={14} className="rec-spin" /> : <RefreshCw size={14} />}
      >
        새로고침
      </Button>
    </div>
  );

  return (
    <AdminLayout pageTitle="추천 성과" activeTab="recommendation" headerActions={headerActions}>
      <div className="rec-page">
        {isLoading ? (
          <div className="rec-loading">
            <Loader2 size={22} className="rec-spin" />
          </div>
        ) : isError ? (
          <div className="rec-notice">
            <AlertTriangle size={16} />
            추천 지표를 불러오지 못했습니다 ({error?.message}). 관리자 키를 확인해 주세요.
          </div>
        ) : data && data.available === false ? (
          <div className="rec-notice">
            <AlertTriangle size={16} />
            {data.error}
          </div>
        ) : (
          <>
            <div className="rec-kpi-grid">
              <KpiCard
                label={`최근 ${days}일 추천 노출`}
                value={`${num(totals.impressions)}회`}
                subText="같은 사람·곡·날은 1회로 집계"
                tagText={`A/B ${data?.abSplit || ''}`}
                tagVariant="info"
                topRight={<BarChart3 size={18} />}
              />
              <KpiCard
                label="클릭률"
                value={pct(totals.impressions ? totals.clicks / totals.impressions : null)}
                subText={`클릭 ${num(totals.clicks)}회`}
                tagText="전체 버전"
                tagVariant="default"
                topRight={<MousePointerClick size={18} />}
              />
              <KpiCard
                label="30초 이상 감상률"
                value={pct(totals.impressions ? totals.good / totals.impressions : null)}
                subText={`감상 ${num(totals.good)}회 · 밴딧·학습의 보상 기준`}
                tagText="핵심 지표"
                tagVariant="success"
                topRight={<Headphones size={18} />}
              />
              <KpiCard
                label="학습 가중치"
                value={activeModel ? activeModel.version : '없음'}
                subText={
                  activeModel
                    ? `AUC ${activeModel.metrics?.auc?.toFixed?.(3) ?? '-'} (기존 ${activeModel.metrics?.baselineAuc?.toFixed?.(3) ?? '-'})`
                    : `데이터 수집 중 · 노출 ${num(training.samples)}/${num(LTR_MIN_SAMPLES)}`
                }
                tagText={activeModel ? '사용 중' : '고정 가중치 사용'}
                tagVariant={activeModel ? 'success' : 'warning'}
                topRight={<Brain size={18} />}
              />
            </div>

            <section className="rec-card">
              <div className="rec-card-head">
                <h3>버전별 성과 (A/B)</h3>
                <p>
                  비율 아래 범위는 95% 신뢰구간입니다. 노출이 {num(MIN_SAMPLE)}회 미만이면 차이를 판단하기 이릅니다.
                  새 방문자(인기 위주)는 이번 업데이트부터 따로 집계되며, 그 전 기록의 v1에는 새 방문자가 섞여 있습니다.
                </p>
              </div>
              <div className="rec-table-wrap">
                <table className="rec-table">
                  <thead>
                    <tr>
                      <th>버전</th>
                      <th className="num">사람</th>
                      <th className="num">노출</th>
                      <th className="num">클릭</th>
                      <th>클릭률</th>
                      <th className="num">30초 감상</th>
                      <th>감상률</th>
                      <th>판단</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variants.length === 0 && (
                      <tr>
                        <td colSpan={8} className="rec-empty">아직 집계할 추천 노출이 없습니다.</td>
                      </tr>
                    )}
                    {variants.map((v) => {
                      const meta = VARIANTS[v.variant] || { label: v.variant, color: '#717273' };
                      return (
                        <tr key={v.variant}>
                          <td>
                            <span className="rec-variant">
                              <span className="rec-legend-swatch" style={{ background: meta.color }} />
                              {meta.label}
                            </span>
                          </td>
                          <td className="num">{num(v.viewers)}</td>
                          <td className="num">{num(v.impressions)}</td>
                          <td className="num">{num(v.clicks)}</td>
                          <td>
                            <RateCell successes={v.clicks} total={v.impressions} />
                          </td>
                          <td className="num">{num(v.good_plays)}</td>
                          <td>
                            <RateCell successes={v.good_plays} total={v.impressions} />
                          </td>
                          <td>
                            {v.impressions < MIN_SAMPLE ? (
                              <span className="rec-pill warn">표본 부족</span>
                            ) : (
                              <span className="rec-pill ok">비교 가능</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rec-card">
              <div className="rec-card-head">
                <h3>일별 30초 이상 감상률</h3>
                <p>노출된 곡 중 눌러서 30초 이상 들은 비율입니다. 노출이 없는 날은 선이 끊깁니다.</p>
              </div>
              <DailyRateChart daily={data?.daily || []} />
            </section>

            <div className="rec-two-col">
              <section className="rec-card">
                <div className="rec-card-head">
                  <h3>후보 출처(팔)별 성과</h3>
                  <p>밴딧은 보상률이 높은 팔에 자리를 더 줍니다. 비중은 최근 7일 서버가 내보낸 곡 기준입니다.</p>
                </div>
                <div className="rec-table-wrap">
                  <table className="rec-table">
                    <thead>
                      <tr>
                        <th>팔</th>
                        <th className="num">노출</th>
                        <th className="num">보상</th>
                        <th>보상률</th>
                        <th>최근 7일 비중</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.keys(ARM_LABELS).map((arm) => {
                        const row = (data?.arms || []).find((a) => a.arm === arm) || { impressions: 0, rewards: 0 };
                        const share = servedTotal ? (served[arm] || 0) / servedTotal : 0;
                        return (
                          <tr key={arm}>
                            <td>{ARM_LABELS[arm]}</td>
                            <td className="num">{num(row.impressions)}</td>
                            <td className="num">{num(row.rewards)}</td>
                            <td>
                              <RateCell successes={row.rewards} total={row.impressions} />
                            </td>
                            <td>
                              <span className="rec-share">
                                <span className="rec-share-track">
                                  <span className="rec-share-fill" style={{ width: `${share * 100}%` }} />
                                </span>
                                <span className="rec-num">{pct(share, 0)}</span>
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rec-card">
                <div className="rec-card-head">
                  <h3>가중치 학습</h3>
                  <p>하루 한 번 자동으로 학습하며, 기존보다 확실히 좋을 때만 새 가중치를 켭니다.</p>
                </div>
                <div className="rec-model">
                  <Progress label="최근 30일 학습 노출" value={training.samples} max={LTR_MIN_SAMPLES} />
                  <Progress label="그중 30초 이상 감상" value={training.positives} max={LTR_MIN_POSITIVES} />
                  {data?.lastTraining && (
                    <p className="rec-model-last">
                      마지막 학습 {fmtDate(data.lastTraining.at)} · {data.lastTraining.reason}
                    </p>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => runAction('train')}
                    disabled={busy === 'train' || data?.trainingRunning}
                    leadingIcon={busy === 'train' ? <Loader2 size={14} className="rec-spin" /> : <Brain size={14} />}
                  >
                    지금 학습
                  </Button>
                  {(data?.models || []).length > 0 && (
                    <table className="rec-table compact">
                      <thead>
                        <tr>
                          <th>버전</th>
                          <th className="num">AUC (기존)</th>
                          <th className="num">노출</th>
                          <th>만든 시각</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.models.map((m) => (
                          <tr key={m.version}>
                            <td>
                              {m.version} {m.active && <span className="rec-pill ok">사용 중</span>}
                            </td>
                            <td className="num">
                              {m.metrics?.auc?.toFixed?.(3) ?? '-'} ({m.metrics?.baselineAuc?.toFixed?.(3) ?? '-'})
                            </td>
                            <td className="num">{num(m.metrics?.samples)}</td>
                            <td>{fmtDate(m.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="rec-divider" />

                <div className="rec-card-head">
                  <h3>함께 들은 곡 (협업 필터링)</h3>
                  <p>매일 새벽 4:10에 다시 계산합니다. 두 곡을 함께 좋아한 사람이 2명 이상일 때만 연결됩니다.</p>
                </div>
                <div className="rec-neighbors">
                  <div>
                    <span className="rec-big rec-num">{num(data?.neighbors?.items)}</span>
                    <span className="rec-muted">곡에 이웃 있음</span>
                  </div>
                  <div>
                    <span className="rec-big rec-num">{num(data?.neighbors?.rows)}</span>
                    <span className="rec-muted">연결</span>
                  </div>
                  <div className="rec-muted">마지막 계산 {fmtDate(data?.neighbors?.updatedAt)}</div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => runAction('rebuild')}
                    disabled={busy === 'rebuild'}
                    leadingIcon={busy === 'rebuild' ? <Loader2 size={14} className="rec-spin" /> : <Share2 size={14} />}
                  >
                    지금 다시 계산
                  </Button>
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
