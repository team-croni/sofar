/**
 * 파티클 ↔ 화면 요소 상호작용 (눈이 쌓이고, 비가 튀고, 벚꽃잎이 내려앉음)
 *
 * - `data-particle-surface="rect" | "circle"` 속성이 붙은 요소(앨범 자켓 · LP판 · LP 자리의 미니플레이어)를
 *   "표면"으로 보고, 떨어지는 파티클이 표면 윗면을 지나가는 순간 앞쪽 캔버스로 옮겨 그림
 *   (떨어지는 동안은 기존 배경 캔버스 = 콘텐츠 뒤, 닿은 뒤부터는 앞쪽 캔버스 = 콘텐츠 위)
 * - 눈: 닿은 눈송이가 납작하게 퍼지며 흩어져 사각형 윗면의 높이맵에 소복이 쌓임
 *       LP판 위에서는 회전을 따라 미끄러져 떨어짐
 * - 비: 닿은 자리에서 작은 물방울이 튀어 오름 (돌고 있는 LP판에서는 회전 방향으로 튐)
 * - 벚꽃: 꽃잎이 내려앉아 잠시 머물다 사라짐
 * - 마우스 호버 3D 기울기: 쌓인 눈이 기울어진 윗면을 그대로 따라가고, 낮은 쪽으로 천천히 흘러 가장자리에서 흩날림
 * - 곡 전환 · 영상 전환(data-particle-shake="1") 중에는 쌓인 것이 조금씩 흩어지며 떨어짐
 *
 * 되돌리기: 아래 SURFACE_INTERACTION_ENABLED 를 false 로 바꾸면 기존 동작과 완전히 같아짐
 */

export const SURFACE_INTERACTION_ENABLED = true;

const SURFACE_SELECTOR = '[data-particle-surface]';
// 콘텐츠보다 위에 떠 있는 불투명한 UI(하단 컨트롤러 등): 앞쪽 캔버스가 이 영역 위로는 그리지 않음
const OCCLUDER_SELECTOR = '[data-particle-occluder]';
// LP판 회전 속도 (VinylPlayer.css spinRecord 12s 기준, 프레임당 라디안)
const DISC_SPIN_PER_FRAME = (Math.PI * 2) / (12 * 60);
const SHAKE_PX = 8; // 한 프레임에 이만큼 넘게 갑자기 움직이면 쌓인 것을 조금 털어냄
const SHAKE_RATE = 0.09; // data-particle-shake 중 프레임당 털어내는 비율
const PILE_BIN = 3; // 눈 높이맵 칸 너비(px)
const MAX_DEBRIS = 400;

const rand = (min, max) => min + Math.random() * (max - min);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function isElementVisible(el) {
  if (typeof el.checkVisibility === 'function') {
    return el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  }
  const cs = window.getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0;
}

const toMatrix = (t) => (t && t !== 'none' ? new DOMMatrix(t) : new DOMMatrix());

/**
 * 3D 기울기(perspective + rotateX/Y) 안에 있는 표면의 윗변 두 끝점을 실제 화면 좌표로 계산
 * (getBoundingClientRect 는 기울어진 모양을 감싼 사각형이라 윗변의 기울기를 알 수 없음)
 * 구조: [perspective 요소] > [data-particle-tilt 요소(rotate)] > [표면 요소(translateZ 등)]
 */
function projectTopEdge(el, rect) {
  const cont = el.closest('[data-particle-tilt]');
  if (!cont || cont === el || el.offsetParent !== cont) return null;
  const persp = cont.parentElement;
  if (!persp || cont.offsetParent !== persp) return null;
  const d = parseFloat(window.getComputedStyle(persp).perspective);
  if (!(d > 0)) return null;

  const mc = toMatrix(window.getComputedStyle(cont).transform);
  const me = toMatrix(window.getComputedStyle(el).transform);
  const ew = el.offsetWidth;
  const eh = el.offsetHeight;
  const cw = cont.offsetWidth;
  const ch = cont.offsetHeight;
  const pr = persp.getBoundingClientRect();
  const ocx = pr.left + pr.width / 2;
  const ocy = pr.top + pr.height / 2;

  const project = (lx) => {
    // transform-origin 은 모두 기본값(가운데)이므로 각 요소 가운데 기준 좌표로 변환
    const pe = me.transformPoint(new DOMPoint(lx - ew / 2, -eh / 2, 0));
    const pc = mc.transformPoint(new DOMPoint(
      pe.x + el.offsetLeft + ew / 2 - cw / 2,
      pe.y + el.offsetTop + eh / 2 - ch / 2,
      pe.z,
    ));
    const X = pc.x + cont.offsetLeft + cw / 2 - persp.offsetWidth / 2;
    const Y = pc.y + cont.offsetTop + ch / 2 - persp.offsetHeight / 2;
    const k = d / (d - pc.z);
    return [ocx + X * k, ocy + Y * k];
  };

  const [x0, y0] = project(0);
  const [x1, y1] = project(ew);
  // 계산이 실제 위치와 크게 어긋나면(예상 못한 구조) 사용하지 않음
  if (Math.abs(Math.min(y0, y1) - rect.top) > 14 || x1 - x0 < ew * 0.6) return null;
  return { x0, y0, x1, y1, w: ew };
}

/* ── 표면 ─────────────────────────────── */

function createSurface(el) {
  return {
    el,
    kind: el.dataset.particleSurface === 'circle' ? 'circle' : 'rect',
    // 감싼 사각형 (원형 표면 · 가림 판정용)
    bx: 0, by: 0, bw: 0, bh: 0,
    // 사각형 윗변 (기울기 반영): 로컬 x(0~w) → 화면 (x0 + ux*lx, y0 + uy*lx)
    x0: 0, y0: 0, ux: 1, uy: 0, w: 0,
    cornerR: 0,
    pileLimit: 0, // data-particle-pile-max (0 = 너비에 따라 자동)
    accum: 1, // data-particle-accum: 쌓이는 속도 배율
    melt: 1, // data-particle-melt: 녹는 속도 배율
    spin: 0,
    shaking: false,
    visible: false,
    measured: false,
    pile: null, // 눈 높이맵 (사각형)
    pending: null, // 아직 높이맵으로 스며드는 중인 눈
    spill: [0, 0], // 왼쪽/오른쪽 가장자리로 넘친 눈 (흩날리는 알갱이로 바뀜)
    settled: [], // 내려앉은 입자 (로컬 좌표)
  };
}

const edgeX = (s, lx) => s.x0 + s.ux * lx;
const edgeY = (s, lx) => s.y0 + s.uy * lx;

// 둥근 모서리 때문에 가장자리로 갈수록 윗면이 내려가는 정도
function cornerDrop(s, lx) {
  const r = s.cornerR;
  if (r <= 0) return 0;
  const d = Math.min(lx, s.w - lx);
  if (d >= r) return 0;
  const k = r - Math.max(0, d);
  return r - Math.sqrt(Math.max(0, r * r - k * k));
}

// 둥근 모서리 구간의 폭 (이 안쪽으로 떨어진 눈은 둥근 면을 타고 미끄러져 떨어짐)
function cornerZone(s) {
  return s.cornerR > 0 ? s.cornerR * 0.8 + 2 : 2;
}

// 표면의 lx 위치에서 윗면이 기울어진 각도 (3D 기울기 + 둥근 모서리의 곡면)
function surfaceAngleAt(s, lx) {
  const e = 0.75;
  const slope = (cornerDrop(s, clamp(lx + e, 0, s.w)) - cornerDrop(s, clamp(lx - e, 0, s.w))) / (2 * e);
  return Math.atan2(s.uy, s.ux) + Math.atan(slope);
}

// 0.6 ~ 1 사이에서 완만하게 오르내리는 값 (쌓인 눈 윗면의 자연스러운 굴곡)
function makeProfile(n) {
  const out = new Float32Array(n);
  const waves = [0, 1, 2].map((k) => ({ f: (0.04 + Math.random() * 0.05) * (k + 1), ph: Math.random() * Math.PI * 2, a: 1 / (k + 1) }));
  const total = waves.reduce((sum, wv) => sum + wv.a, 0);
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (const wv of waves) v += Math.sin(i * wv.f + wv.ph) * wv.a;
    out[i] = 0.8 + 0.2 * (v / total);
  }
  return out;
}

// 가장자리로 갈수록 쌓일 수 있는 최대 높이를 줄임 (모서리에서 흘러내린 느낌)
function edgeTaper(s, bin) {
  const edge = Math.min(bin * PILE_BIN, s.w - bin * PILE_BIN);
  return clamp(edge / (s.cornerR + 10), 0.15, 1);
}

// 배경 캔버스에서 같은 깊이(z)의 입자가 떨어지는 속도 (ParticleEffect createParticle 과 같은 식)
function terminalVy(item, speed) {
  const z = item.z ?? 0.5;
  return (item.type === 'sakura' ? 0.45 + z * 0.95 : 0.22 + z * 1.25) * speed;
}

function pileAt(s, lx) {
  if (!s.pile) return 0;
  const i = clamp(Math.floor(lx / PILE_BIN), 0, s.pile.length - 1);
  return s.pile[i];
}

// 사각형 표면 윗면(쌓인 눈 포함)의 화면 y
function rectTopAt(s, lx) {
  return edgeY(s, lx) + cornerDrop(s, lx) - pileAt(s, lx);
}

function circleGeom(s) {
  const r = s.bw / 2;
  return { cx: s.bx + r, cy: s.by + s.bh / 2, r };
}

/* ── 시스템 ─────────────────────────────── */

/**
 * @param {object} [opts]
 * @param {number} [opts.accumScale] 쌓이는 양 배율. 효과가 많을수록(입자가 많이 떨어질수록) 낮춰서
 *   "보통"·"많이"에서도 금방 가득 차지 않게 함 (ParticleEffect 에서 밀도에 맞춰 계산)
 */
export function createSurfaceSystem(effect, canvas, sprites, opts = {}) {
  const accumScale = opts.accumScale ?? 1;
  const ctx = canvas.getContext('2d');
  const surfaces = new Map(); // el -> surface
  const debris = []; // 표면에서 떨어져 나온 / 튀어 오른 자유 입자
  let frame = 0;
  let w = 1;
  let h = 1;
  let dpr = 1;

  const pileMax = (s) => s.pileLimit || clamp(5 + s.w * 0.018, 5, 12);
  let occluderEls = [];
  let occluderRects = [];

  function rescan() {
    const found = new Set(document.querySelectorAll(SURFACE_SELECTOR));
    surfaces.forEach((s, el) => {
      if (!found.has(el)) {
        // 표면이 사라지면 쌓인 것은 마지막 자리에서 흩어져 떨어짐
        if (s.visible) shedPartial(s, 1);
        surfaces.delete(el);
      }
    });
    found.forEach((el) => {
      if (!surfaces.has(el)) surfaces.set(el, createSurface(el));
    });
    occluderEls = [...document.querySelectorAll(OCCLUDER_SELECTOR)];
  }

  function pushDebris(d) {
    if (debris.length >= MAX_DEBRIS) debris.shift();
    debris.push({
      rot: rand(0, Math.PI * 2),
      vrot: rand(-0.06, 0.06),
      flip: rand(0, Math.PI * 2),
      age: 0,
      z: rand(0.3, 0.65),
      phase: rand(0, Math.PI * 2),
      freq: rand(0.006, 0.016),
      sway: rand(0.3, 0.6),
      ...d,
    });
  }

  // 쌓인 눈에서 떨어져 나가는 작은 눈 알갱이
  function pushGrain(x, y, vx, vy, src = null) {
    pushDebris({ type: 'snow', x, y, vx, vy, size: rand(2, 3.6), alpha: 0.92, life: 1200, src });
  }

  /**
   * 쌓인 것의 일부(frac)를 흩어지게 함 (한꺼번에 사라지지 않고 알갱이로 떨어짐)
   */
  function shedPartial(s, frac) {
    if (frac <= 0) return;
    if (s.pile) {
      const pile = s.pile;
      let acc = 0;
      for (let i = 0; i < pile.length; i++) {
        const take = (pile[i] + s.pending[i]) * frac;
        pile[i] = Math.max(0, pile[i] * (1 - frac));
        s.pending[i] *= 1 - frac;
        acc += take;
        if (acc > 2.2) {
          acc -= 2.2;
          const lx = i * PILE_BIN;
          pushGrain(edgeX(s, lx) + rand(-1.5, 1.5), edgeY(s, lx) + cornerDrop(s, lx) - rand(0, pile[i] + 1), rand(-0.35, 0.35), rand(-0.5, 0.05), s);
        }
      }
    }
    for (let i = s.settled.length - 1; i >= 0; i--) {
      if (frac < 1 && Math.random() > frac) continue;
      const item = s.settled[i];
      s.settled.splice(i, 1);
      if (item.type === 'frag' || item.type === 'bead') continue;
      const pos = settledPos(s, item);
      pushDebris({ ...item, x: pos.x, y: pos.y, vx: rand(-0.4, 0.4), vy: rand(-0.5, 0), age: 0, life: 1200, src: s });
    }
  }

  function clearSurface(s) {
    if (s.pile) s.pile.fill(0);
    if (s.pending) s.pending.fill(0);
    s.spill[0] = 0;
    s.spill[1] = 0;
    s.settled.length = 0;
  }

  function measure(dt) {
    occluderRects = [];
    for (const el of occluderEls) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) occluderRects.push(r);
    }
    surfaces.forEach((s) => {
      const el = s.el;
      const rect = el.getBoundingClientRect();
      const visible = rect.width > 4 && rect.height > 4 && isElementVisible(el);
      if (!visible) {
        if (s.visible) clearSurface(s);
        s.visible = false;
        s.measured = false;
        return;
      }

      s.bx = rect.left;
      s.by = rect.top;
      s.bw = rect.width;
      s.bh = rect.height;

      if (s.kind === 'rect') {
        const edge = projectTopEdge(el, rect)
          || { x0: rect.left, y0: rect.top, x1: rect.right, y1: rect.top, w: rect.width };
        const moved = s.measured ? Math.max(Math.abs(edge.x0 - s.x0), Math.abs(edge.y0 - s.y0)) : 0;
        if (s.measured && Math.abs(edge.w - s.w) > 1.5) clearSurface(s);
        else if (moved > SHAKE_PX) shedPartial(s, clamp((moved - SHAKE_PX) / 20, 0.1, 0.6));
        s.x0 = edge.x0;
        s.y0 = edge.y0;
        s.w = edge.w;
        s.ux = (edge.x1 - edge.x0) / edge.w;
        s.uy = (edge.y1 - edge.y0) / edge.w;
      } else {
        const moved = s.measured ? Math.max(Math.abs(rect.left - s.x0), Math.abs(rect.top - s.y0)) : 0;
        if (moved > SHAKE_PX) shedPartial(s, clamp((moved - SHAKE_PX) / 20, 0.1, 0.6));
        s.x0 = rect.left;
        s.y0 = rect.top;
        s.w = rect.width;
      }

      s.visible = true;
      s.measured = true;
      s.cornerR = Number(el.dataset.particleRadius || 0);
      s.pileLimit = Number(el.dataset.particlePileMax || 0);
      s.accum = Number(el.dataset.particleAccum || 1);
      s.melt = Number(el.dataset.particleMelt || 1);
      s.spin = el.dataset.particleSpin === '1' ? DISC_SPIN_PER_FRAME : 0;
      s.shaking = el.dataset.particleShake === '1';
      if (s.shaking) shedPartial(s, Math.min(1, SHAKE_RATE * dt));

      if (s.kind === 'rect' && effect === 'snow') {
        const bins = Math.max(1, Math.ceil(s.w / PILE_BIN));
        if (!s.pile || s.pile.length !== bins) {
          s.pile = new Float32Array(bins);
          s.profile = makeProfile(bins); // 칸마다 쌓일 수 있는 높이를 들쭉날쭉하게 (평평한 판처럼 보이지 않게)
          s.pending = new Float32Array(bins);
        }
      }
    });
  }

  // 내려앉은 입자의 화면 좌표
  function settledPos(s, item) {
    if (s.kind === 'circle') {
      const { cx, cy, r } = circleGeom(s);
      const rr = r + item.lift;
      return { x: cx + Math.sin(item.theta) * rr, y: cy - Math.cos(item.theta) * rr };
    }
    const lx = clamp(item.lx, 0, s.w);
    const onPile = item.onPile ? pileAt(s, lx) : 0;
    return { x: edgeX(s, lx), y: edgeY(s, lx) + cornerDrop(s, lx) - item.lift - onPile };
  }

  // 다른 사각형 표면(예: 자켓)에 가려지는 지점인지
  function occluded(x, y, self) {
    for (const s of surfaces.values()) {
      if (s === self || !s.visible || s.kind !== 'rect') continue;
      if (x > s.bx && x < s.bx + s.bw && y > s.by && y < s.by + s.bh) return true;
    }
    return false;
  }

  /* ── 착지 판정 ── */

  /**
   * 떨어지는 파티클이 이번 프레임에 어떤 표면 윗면을 지났는지 확인하고, 지났으면 착지 처리
   * @returns {boolean} 착지했으면 true (호출 측은 파티클을 다시 위에서 생성)
   */
  function tryLand(p, prevY, size, skip = null) {
    if (p.y <= prevY) return false;
    let best = null;
    let bestY = Infinity;
    let bestLx = 0;
    for (const s of surfaces.values()) {
      if (!s.visible || s.shaking || s === skip) continue;
      let landY;
      let lx = 0;
      if (s.kind === 'circle') {
        const { cx, cy, r } = circleGeom(s);
        const dx = p.x - cx;
        if (Math.abs(dx) > r * 0.96) continue;
        landY = cy - Math.sqrt(r * r - dx * dx);
      } else {
        lx = (p.x - s.x0) / s.ux;
        if (lx < 1 || lx > s.w - 1) continue;
        landY = rectTopAt(s, lx);
      }
      if (prevY <= landY && p.y >= landY && landY < bestY) {
        best = s;
        bestY = landY;
        bestLx = lx;
      }
    }
    if (!best) return false;
    land(best, p, bestY, bestLx, size);
    return true;
  }

  function land(s, p, y, lx, size) {
    if (effect === 'rain') {
      splash(s, p.x, y, lx, p);
      return;
    }

    if (s.kind === 'circle') {
      const { cx, cy } = circleGeom(s);
      const theta = Math.atan2(p.x - cx, cy - y);
      if (occluded(p.x, y, s)) return;
      const limit = effect === 'snow' ? 46 : 10;
      if (s.settled.length >= limit) s.settled.shift();
      s.settled.push(makeSettled(p, size, { theta, vtheta: 0, lift: effect === 'snow' ? 0 : size * 0.3 }));
      return;
    }

    if (effect === 'snow' && s.pile) {
      const edgeDist = Math.min(lx, s.w - lx);
      const zone = cornerZone(s);
      if (edgeDist < zone) {
        // 둥근 모서리에 떨어진 눈송이: 퍼지지 않고 곡면을 타고 바깥쪽으로 미끄러져 떨어짐
        const out = lx < s.w / 2 ? -1 : 1;
        pushDebris({
          type: 'snow', x: p.x + out * 1.5, y: y - 1, vx: out * rand(0.35, 0.8), vy: rand(0, 0.2),
          size, alpha: clamp(p.alpha ?? 0.9, 0.6, 1), z: p.z ?? 0.5, life: 1200, src: s,
        });
        return;
      }
      // 쌓일 양을 대기열(pending)에 넣어 두고 매 프레임 조금씩 높이맵으로 옮김
      const i = clamp(Math.floor(lx / PILE_BIN), 0, s.pile.length - 1);
      const add = clamp(size * 0.9, 1.8, 5) * s.accum * accumScale;
      const max = pileMax(s);
      const spread = [[0, 1], [-1, 0.7], [1, 0.7], [-2, 0.35], [2, 0.35], [-3, 0.12], [3, 0.12]];
      for (const [o, f] of spread) {
        const j = i + o;
        if (j < 0 || j >= s.pile.length) continue;
        const room = max * edgeTaper(s, j) * s.profile[j] - s.pile[j] - s.pending[j];
        if (room > 0) s.pending[j] += Math.min(room, add * f * 0.8);
      }
      // 닿은 눈송이: 작은 조각 몇 개로 부서지며 살짝 튀어 흩어지고,
      // 각 조각은 쌓인 눈 위에 내려앉은 뒤 천천히 스며들며 사라짐
      const alpha = clamp(p.alpha ?? 0.9, 0.6, 1);
      const n = s.accum < 1 ? 2 : size > 6 ? 5 : 3 + (Math.random() < 0.5 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const core = k === 0;
        const power = 0.5 + size * 0.05;
        s.settled.push({
          type: 'frag', lx, h: 0.3, onPile: true, lift: 0.3,
          vlx: core ? rand(-0.12, 0.12) : rand(-0.85, 0.85) * power,
          vh: core ? rand(0, 0.2) : rand(0.3, 0.95) * power,
          size: core ? Math.max(1.6, size * 0.55) : Math.max(1, size * rand(0.22, 0.4)),
          alpha: alpha * (core ? 1 : 0.9), age: 0, landedAt: -1, fade: rand(40, 75), life: 400,
        });
      }
      while (s.settled.length > 90) s.settled.shift();
      return;
    }

    // 벚꽃
    let petals = 0;
    for (const it of s.settled) if (it.type === 'sakura') petals++;
    if (petals >= 12) s.settled.splice(s.settled.findIndex((it) => it.type === 'sakura'), 1);
    s.settled.push(makeSettled(p, size, { lx, vlx: 0, lift: size * 0.12 }));
  }

  function makeSettled(p, size, extra) {
    const base = {
      type: effect,
      size,
      age: 0,
      alpha: effect === 'snow' ? clamp(p.alpha ?? 0.9, 0.6, 1) : clamp(p.alpha ?? 0.9, 0.7, 1),
      life: effect === 'snow' ? rand(600, 1100) : rand(480, 840),
      // 꽃잎은 옆으로 누운 모습(긴 축이 수평)으로 내려앉고, 납작하게 눌려 보임
      rot: (Math.random() < 0.5 ? -1 : 1) * Math.PI / 2 + rand(-0.3, 0.3),
      flat: rand(0.4, 0.7),
      tint: p.tint ?? 0,
      z: p.z ?? 0.5,
      phase: p.phase ?? rand(0, Math.PI * 2),
      freq: p.freq ?? rand(0.006, 0.016),
      sway: p.sway ?? rand(0.3, 0.6),
    };
    return { ...base, ...extra };
  }

  function splash(s, x, y, lx, p) {
    let tx = 0;
    let ty = 0;
    if (s.kind === 'circle' && s.spin) {
      // 회전하는 LP판: 접선 방향으로 물방울이 쓸려 나감
      const { cx, cy, r } = circleGeom(s);
      const theta = Math.atan2(x - cx, cy - y);
      const v = s.spin * r;
      tx = Math.cos(theta) * v;
      ty = Math.sin(theta) * v;
    }
    const strength = 0.6 + (p.z ?? 0.5) * 0.8;
    // 넓은 표면(하단 컨트롤러)은 닿는 빗방울이 많으므로 튀는 양을 줄임
    const wide = s.kind === 'rect' && s.w > 600;
    if (wide && Math.random() < 0.4) return;
    const n = wide ? 1 + (Math.random() < 0.4 ? 1 : 0) : Math.random() < 0.5 ? 2 : 3;
    for (let i = 0; i < n; i++) {
      pushDebris({
        type: 'drop',
        x,
        y: y - 0.5,
        vx: (rand(-1.5, 1.5) + tx * 1.4) * strength,
        vy: (rand(-2.6, -1.1) + ty) * strength,
        size: rand(0.6, 1.15),
        alpha: rand(0.55, 0.85),
        life: rand(26, 42),
      });
    }
    // 닿은 자리에 잠깐 번지는 물자국
    pushDebris({ type: 'ring', x, y, vx: tx * 0.5, vy: 0, size: 1.5 + strength * 2, alpha: 0.45, life: 14, fixed: true });
    // 가끔 윗면에 물방울이 잠시 맺힘
    if (s.kind === 'rect' && Math.random() < 0.08 && s.settled.length < 24) {
      s.settled.push({ type: 'bead', lx, lift: 0.6, size: rand(0.8, 1.4), alpha: 0.7, age: 0, life: rand(90, 200) });
    }
  }

  /* ── 갱신 + 그리기 ── */

  function stepPile(s, dt) {
    const pile = s.pile;
    const pending = s.pending;
    const n = pile.length;
    const max = pileMax(s);

    // 닿은 눈이 조금씩 스며들며 쌓임
    const k = Math.min(1, 0.04 * dt);
    for (let i = 0; i < n; i++) {
      if (pending[i] > 0.001) {
        const move = pending[i] * k;
        pile[i] += move;
        pending[i] -= move;
      }
    }

    // 기울어진 윗면: 낮은 쪽으로 천천히 흘러감 (가장자리를 넘으면 흩날림)
    const slope = s.uy / (s.ux || 1);
    if (Math.abs(slope) > 0.004) {
      const dir = slope > 0 ? 1 : -1;
      const rate = Math.min(0.25, Math.abs(slope) * 0.9 * dt);
      const start = dir > 0 ? n - 1 : 0;
      for (let c = 0; c < n; c++) {
        const i = start - c * dir;
        const amt = pile[i] * rate;
        if (amt <= 0) continue;
        pile[i] -= amt;
        const j = i + dir;
        if (j >= 0 && j < n) pile[j] += amt;
        else s.spill[dir > 0 ? 1 : 0] += amt;
      }
    }

    // 녹으면서 옆 칸과 고르게 퍼짐 (둥근 모서리 쪽은 얇게)
    // 녹는 속도는 쌓인 높이에 비례해서 빨라짐 → 많이 내려도 최대 높이에 꽉 차지 않고
    // 내리는 양과 녹는 양이 맞는 높이에서 자연스럽게 들쭉날쭉 유지됨
    const melt = 0.0003 * s.melt;
    const meltK = 0.00025 * s.melt;
    let prev = pile[0];
    for (let i = 0; i < n; i++) {
      const cur = pile[i];
      const next = i + 1 < n ? pile[i + 1] : cur;
      const avg = (prev + next) / 2;
      prev = cur;
      let v = cur + (avg - cur) * 0.006 * dt;
      v -= (melt + cur * meltK) * dt;
      v = Math.min(v, max * edgeTaper(s, i) * s.profile[i]);
      pile[i] = v > 0 ? v : 0;
    }

    for (let side = 0; side < 2; side++) {
      while (s.spill[side] > 2.4) {
        s.spill[side] -= 2.4;
        const dir = side === 0 ? -1 : 1;
        const lx = side === 0 ? 0 : s.w;
        pushGrain(edgeX(s, lx) + dir * rand(2, 4), edgeY(s, lx) + cornerDrop(s, lx) - rand(0, 2), dir * rand(0.35, 0.8), rand(-0.1, 0.15), s);
      }
    }
  }

  function stepSurface(s, dt, speed) {
    if (s.pile) stepPile(s, dt);
    const slope = s.kind === 'rect' ? s.uy / (s.ux || 1) : 0;

    for (let i = s.settled.length - 1; i >= 0; i--) {
      const item = s.settled[i];
      item.age += dt;

      if (s.kind === 'circle') {
        // 회전을 따라 이동 + 기울어진 곳에서는 미끄러짐
        item.theta += s.spin * dt;
        const a = Math.abs(item.theta);
        const stick = item.type === 'snow' ? 0.4 : 0.5;
        const { r } = circleGeom(s);
        if (a > stick) item.vtheta += Math.sign(item.theta) * 0.0006 * Math.sin(a) * dt * speed;
        // 미끄러지는 속도는 떨어지는 눈송이 속도를 넘지 않게 (굴러 떨어진 뒤에도 같은 속도로 이어짐)
        const maxV = terminalVy(item, speed) / r;
        item.vtheta = clamp(item.vtheta, -maxV, maxV);
        item.theta += item.vtheta * dt;
        if (Math.abs(item.theta) > 1.2) {
          const pos = settledPos(s, item);
          const v = (s.spin + item.vtheta) * r;
          s.settled.splice(i, 1);
          pushDebris({ ...item, x: pos.x, y: pos.y, vx: Math.cos(item.theta) * v, vy: Math.sin(item.theta) * Math.abs(v), age: 0, life: 1200, src: s });
          continue;
        }
      } else if (item.type === 'frag') {
        if (item.landedAt < 0) {
          // 작은 포물선을 그리며 튀었다가 쌓인 눈 위에 내려앉음
          item.vh -= 0.07 * dt;
          item.h += item.vh * dt;
          item.lx += item.vlx * dt;
          if (item.h <= 0) {
            item.h = 0;
            item.landedAt = item.age;
          }
          // 둥근 모서리나 가장자리 밖으로 튄 조각은 그대로 떨어짐
          const zone = cornerZone(s);
          if (item.lx < zone || item.lx > s.w - zone) {
            const pos = settledPos(s, item);
            s.settled.splice(i, 1);
            pushDebris({ type: 'snow', x: pos.x, y: pos.y, vx: item.vlx, vy: -item.vh, size: item.size * 1.25, alpha: item.alpha, life: 1200, src: s });
            continue;
          }
        }
        item.lift = item.h;
        if (item.landedAt >= 0 && item.age - item.landedAt > item.fade) {
          s.settled.splice(i, 1);
          continue;
        }
      } else if (item.type === 'sakura' && Math.abs(slope) > 0.015) {
        // 기울어진 윗면에서 꽃잎이 천천히 미끄러짐
        item.vlx = clamp((item.vlx || 0) + slope * 0.03 * dt, -0.6, 0.6);
        item.lx += item.vlx * dt;
        if (item.lx < 0 || item.lx > s.w) {
          const pos = settledPos(s, item);
          s.settled.splice(i, 1);
          pushDebris({ ...item, x: pos.x, y: pos.y, vx: item.vlx, vy: 0, age: 0, life: 1200, src: s });
          continue;
        }
      }

      if (item.age > item.life) s.settled.splice(i, 1);
    }
  }

  // 물방울 등: 표면 윗면을 지났는지만 확인
  function hitSurface(p, prevY, skip) {
    for (const s of surfaces.values()) {
      if (!s.visible || s === skip) continue;
      let top;
      if (s.kind === 'circle') {
        const { cx, cy, r } = circleGeom(s);
        const dx = p.x - cx;
        if (Math.abs(dx) > r * 0.96) continue;
        top = cy - Math.sqrt(r * r - dx * dx);
      } else {
        const lx = (p.x - s.x0) / s.ux;
        if (lx < 1 || lx > s.w - 1) continue;
        top = rectTopAt(s, lx);
      }
      if (prevY <= top && p.y >= top) return true;
    }
    return false;
  }

  function stepDebris(dt, speed, wind) {
    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i];
      d.age += dt;
      if (!d.fixed) {
        if (d.type === 'drop') {
          d.vy += 0.16 * dt * speed;
        } else if (d.type === 'snow') {
          // 배경에서 떨어지는 눈송이와 같은 속도·흔들림으로 서서히 맞춰짐 (공기 저항)
          d.phase += d.freq * dt;
          const tx = (wind * (0.35 + d.z * 1.1) + Math.sin(d.phase) * d.sway) * speed;
          d.vy += (terminalVy(d, speed) - d.vy) * 0.035 * dt;
          d.vx += (tx - d.vx) * 0.035 * dt;
        } else {
          // 꽃잎: 배경 꽃잎과 같은 방식으로 팔랑팔랑
          d.flip += 0.03 * dt;
          d.rot += d.vrot * dt;
          d.phase += 0.008 * dt;
          const flat = Math.abs(Math.cos(d.flip));
          const ty = terminalVy(d, speed) * (0.55 + 0.45 * (1 - flat));
          const tx = (wind * (0.6 + d.z * 1.2) + Math.sin(d.phase) * 0.28 * (0.4 + d.z)) * speed;
          d.vy += (ty - d.vy) * 0.03 * dt;
          d.vx += (tx - d.vx) * 0.03 * dt;
        }
        const prevY = d.y;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        // 떨어지던 것이 아래쪽 표면(하단 컨트롤러 등)에 닿으면 그 위에 쌓이거나 내려앉음 (물방울은 스며듦)
        if (d.age > 2 && d.type !== 'ring') {
          const hit = d.type === 'drop' ? hitSurface(d, prevY, d.src) : tryLand(d, prevY, d.size, d.src);
          if (hit) {
            debris.splice(i, 1);
            continue;
          }
        }
      } else {
        d.x += d.vx * dt;
      }
      if (d.age > d.life || d.y > h + 30 || d.x < -40 || d.x > w + 40) debris.splice(i, 1);
    }
  }

  function drawPile(s) {
    const pile = s.pile;
    let maxH = 0;
    for (let i = 0; i < pile.length; i++) if (pile[i] > maxH) maxH = pile[i];
    if (maxH < 0.25) return;

    const baseY = (lx) => edgeY(s, lx) + cornerDrop(s, lx) + 0.5;
    ctx.beginPath();
    ctx.moveTo(edgeX(s, 0), baseY(0));
    let px = edgeX(s, 0);
    let py = baseY(0) - pile[0];
    ctx.lineTo(px, py);
    for (let i = 1; i < pile.length; i++) {
      const lx = Math.min(s.w, i * PILE_BIN + PILE_BIN / 2);
      const x = edgeX(s, lx);
      const y = baseY(lx) - pile[i];
      ctx.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2);
      px = x;
      py = y;
    }
    ctx.lineTo(edgeX(s, s.w), baseY(s.w) - pile[pile.length - 1]);
    for (let lx = s.w; lx >= 0; lx -= PILE_BIN) ctx.lineTo(edgeX(s, lx), baseY(lx));
    ctx.closePath();

    const top = Math.min(s.y0, edgeY(s, s.w));
    const g = ctx.createLinearGradient(0, top - maxH, 0, top + Math.abs(s.uy * s.w) + 1);
    g.addColorStop(0, 'rgba(255,255,255,0.97)');
    g.addColorStop(1, 'rgba(222,230,242,0.92)');
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = g;
    ctx.globalAlpha = 1;
    ctx.fill();
    ctx.restore();
  }

  function drawSnowDot(x, y, size, alpha) {
    ctx.globalAlpha = alpha;
    ctx.drawImage(sprites.crisp, x - size / 2, y - size / 2, size, size);
  }

  function drawPetal(x, y, size, rot, sx, tint, alpha) {
    const sprite = sprites[tint % sprites.length].sharp;
    const full = size * (sprite.width / 64);
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    ctx.globalAlpha = alpha;
    ctx.setTransform(dpr * cos * sx, dpr * sin * sx, -dpr * sin, dpr * cos, x * dpr, y * dpr);
    ctx.drawImage(sprite, -full / 2, -full / 2, full, full);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawDrop(x, y, size, alpha) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(225,235,250,1)';
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * 표면 위에 얹힌 눈 덩이(반구) — 밑면이 (x, y) 표면에 붙어 있고, angle 만큼 표면 기울기를 따라 회전
   * 눈송이 스프라이트의 위쪽 절반만 잘라 그려서 바닥이 평평한 덩이 모양을 만듦
   */
  function drawMound(x, y, width, height, angle, alpha) {
    if (alpha <= 0.01 || height <= 0.05) return;
    const img = sprites.crisp;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    ctx.globalAlpha = alpha;
    ctx.setTransform(dpr * cos, dpr * sin, -dpr * sin, dpr * cos, x * dpr, y * dpr);
    ctx.drawImage(img, 0, 0, img.width, img.height / 2, -width / 2, -height, width, height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawSettled(item, x, y, angle) {
    const t = Math.min(1, item.age / item.life);
    const d = Math.max(2.2, item.size * 0.8);
    if (item.type === 'frag') {
      // 조각: 바닥이 표면(쌓인 눈)에 닿도록 그리고, 내려앉은 뒤에는 조금 가라앉으며 옅어짐
      const f = item.landedAt < 0 ? 0 : Math.min(1, (item.age - item.landedAt) / item.fade);
      const sz = item.size * (1 - 0.35 * f);
      drawSnowDot(x, y - sz * 0.32 + f * sz * 0.2, sz, item.alpha * (1 - f));
    } else if (item.type === 'snow') {
      // LP판 테두리에 얹힌 눈송이: 테두리에 붙은 작은 덩이 (시간이 다 되면 천천히 녹아 옅어짐)
      const fade = t < 0.8 ? 1 : Math.max(0, 1 - (t - 0.8) / 0.2);
      drawMound(x, y + d * 0.2, d * 1.25, d * 0.6 * (0.6 + 0.4 * fade), angle, item.alpha * fade);
    } else if (item.type === 'sakura') {
      const fade = t < 0.75 ? 1 : Math.max(0, 1 - (t - 0.75) / 0.25);
      drawPetal(x, y, item.size, item.rot, item.flat, item.tint, fade * item.alpha);
    } else if (item.type === 'bead') {
      const fade = t < 0.75 ? 1 : Math.max(0, 1 - (t - 0.75) / 0.25);
      drawDrop(x, y, item.size, fade * item.alpha);
    }
  }

  function clipOccluders() {
    if (!occluderRects.length) return;
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    for (const r of occluderRects) ctx.rect(r.left, r.top + 0.5, r.width, r.height);
    ctx.clip('evenodd');
  }

  /**
   * 렌즈 가까이(앞쪽)를 지나가는 파티클을 콘텐츠(LP판·미니플레이어) 앞에 그리기 위한 캔버스
   * update() 다음에 호출하고, 다 그린 뒤 endForeground() 로 닫음
   */
  function beginForeground() {
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    clipOccluders();
    return ctx;
  }

  function endForeground() {
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function update(dt, opts) {
    const { speed, wind } = opts;
    frame++;
    if (frame % 30 === 1) rescan();
    measure(dt);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, w, h);

    // 하단 컨트롤러 같은 위쪽 UI 영역에는 그리지 않음 (그 뒤로 지나가는 것처럼 보이게)
    ctx.save();
    clipOccluders();

    surfaces.forEach((s) => {
      if (!s.visible) return;
      stepSurface(s, dt, speed);
      if (s.pile) drawPile(s);
      for (let i = 0; i < s.settled.length; i++) {
        const item = s.settled[i];
        const pos = settledPos(s, item);
        if (s.kind === 'circle' && occluded(pos.x, pos.y, s)) continue;
        drawSettled(item, pos.x, pos.y, s.kind === 'circle' ? item.theta : surfaceAngleAt(s, item.lx));
      }
    });

    stepDebris(dt, speed, wind);
    for (let i = 0; i < debris.length; i++) {
      const d = debris[i];
      const t = d.age / d.life;
      if (d.type === 'ring') {
        ctx.globalAlpha = d.alpha * (1 - t);
        ctx.strokeStyle = 'rgba(225,235,250,1)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.ellipse(d.x, d.y, d.size * (0.5 + t), d.size * 0.28 * (0.5 + t), 0, 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }
      const fade = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
      if (d.type === 'sakura') {
        drawPetal(d.x, d.y, d.size, d.rot, Math.max(0.15, Math.abs(Math.cos(d.flip))), d.tint, fade * d.alpha);
      } else if (d.type === 'drop') {
        drawDrop(d.x, d.y, d.size, fade * d.alpha);
      } else {
        drawSnowDot(d.x, d.y, Math.max(2, d.size * 0.8), fade * d.alpha);
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function resize(nw, nh, ndpr) {
    w = nw;
    h = nh;
    dpr = ndpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }

  function destroy() {
    surfaces.clear();
    debris.length = 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  rescan();
  return { tryLand, update, beginForeground, endForeground, resize, destroy };
}

/** 표면 상호작용을 지원하는 효과인지 (반딧불은 떨어지지 않으므로 제외) */
export function supportsSurfaces(effect) {
  return SURFACE_INTERACTION_ENABLED && (effect === 'snow' || effect === 'rain' || effect === 'sakura');
}
