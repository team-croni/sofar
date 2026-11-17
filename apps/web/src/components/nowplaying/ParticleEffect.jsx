import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { createSurfaceSystem, supportsSurfaces } from './particleSurfaces';
import './NowPlayingBackdrop.css';

/**
 * 캔버스 기반 파티클 효과 (눈 / 비 / 벚꽃 / 반딧불)
 *
 * 자연스러운 연출을 위한 원칙
 * - 깊이(z): 파티클마다 0(멀리)~1(가까이) 깊이를 갖고, 크기·속도·투명도·흐림이 깊이에 비례 (원근감)
 *   대부분은 멀리 있는 작은 입자, 가끔 렌즈 가까이 지나가는 크고 흐린 보케 입자
 * - 바람: 천천히 세기가 바뀌는 전역 바람이 모든 입자를 같은 방향으로 흔듦 (돌풍 느낌)
 * - 미리 그린 스프라이트(오프스크린 캔버스)를 drawImage로 찍어 부드러운 가장자리 + 성능 확보
 * - 부모 크기에 맞춰 리사이즈, 탭이 숨겨지면 정지, prefers-reduced-motion이면 정지 화면 한 장만 그림
 */

// 화면 면적 100,000px² 당 파티클 수
const DENSITY = {
  snow: { low: 10, medium: 22, high: 40 },
  rain: { low: 10, medium: 22, high: 40 },
  sakura: { low: 1.2, medium: 2.5, high: 5 },
  fireflies: { low: 1.6, medium: 3, high: 5.5 },
};

const MAX_PARTICLES = 900;

// 이 깊이(z)보다 가까운 입자는 콘텐츠(LP판·미니플레이어) 앞을 지나감 → 표면에 닿지 않음
// (벚꽃은 초점이 나간 가까운 꽃잎 = blurred 가 앞을 지나감)
const FG_DEPTH = { snow: 0.82, rain: 0.8 };

const rand = (min, max) => min + Math.random() * (max - min);
// 멀리 있는 입자가 더 많도록 깊이 분포를 치우침
const randDepth = (bias = 1.8) => Math.pow(Math.random(), bias);

/* ── 스프라이트 ─────────────────────────────── */

function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const supportsCanvasFilter = (() => {
  try {
    return typeof document !== 'undefined' && 'filter' in makeCanvas(1).getContext('2d');
  } catch (e) {
    return false;
  }
})();

function softDot(size, stops) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const r = size / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  stops.forEach(([offset, color]) => g.addColorStop(offset, color));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

function buildSnowSprites() {
  return {
    // 멀리: 작고 또렷
    crisp: softDot(64, [[0, 'rgba(255,255,255,1)'], [0.55, 'rgba(255,255,255,0.95)'], [1, 'rgba(255,255,255,0)']]),
    // 중간: 살짝 퍼짐
    soft: softDot(64, [[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,0.75)'], [1, 'rgba(255,255,255,0)']]),
    // 가까이: 초점이 나간 보케
    bokeh: softDot(64, [[0, 'rgba(255,255,255,0.5)'], [0.55, 'rgba(255,255,255,0.32)'], [0.8, 'rgba(255,255,255,0.12)'], [1, 'rgba(255,255,255,0)']]),
  };
}

function buildRainSprite() {
  // 위(꼬리)는 투명, 아래(머리)로 갈수록 밝아지는 모션 블러 빗줄기
  const c = makeCanvas(4, 128);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(210,222,240,0)');
  g.addColorStop(0.7, 'rgba(210,222,240,0.55)');
  g.addColorStop(1, 'rgba(235,242,255,0.95)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 128);
  return c;
}

// 실제 벚꽃잎(왕벚나무) 모양: 밑동(꽃잎 자루)은 가늘고, 위쪽 1/3 지점이 가장 넓고,
// 끝은 거의 평평한 가운데에 얕은 홈이 하나 있음 (하트처럼 둥근 두 볼이 아님)
// 꽃잎마다 폭 · 홈 깊이 · 좌우 비대칭 · 색을 조금씩 다르게 해서 여러 장의 스프라이트로 만듦
function drawPetal(ctx, s, v) {
  const cx = s * 0.5 + v.lean * s * 0.03;
  const by = s * 0.97; // 밑동
  const L = s * 0.9; // 길이
  const ty = by - L; // 끝
  const wl = s * v.width * (1 + v.asym); // 왼쪽 반폭
  const wr = s * v.width * (1 - v.asym); // 오른쪽 반폭
  const nd = L * v.notch; // 홈 깊이
  const nw = Math.min(wl, wr) * 0.16; // 홈 반폭

  const claw = Math.min(wl, wr) * 0.16; // 밑동(꽃잎 자루) 반폭: 뾰족하지 않고 좁고 둥근 끝
  const path = new Path2D();
  path.moveTo(cx - claw, by - L * 0.03);
  path.quadraticCurveTo(cx, by + L * 0.015, cx + claw, by - L * 0.03);
  // 오른쪽: 거의 곧게 넓어지다가 위쪽 3/4 지점에서 가장 넓고, 어깨가 넓게 둥글어지며 끝으로
  path.bezierCurveTo(cx + wr * 0.4, by - L * 0.2, cx + wr * 0.92, by - L * 0.46, cx + wr * 0.99, by - L * 0.72);
  path.bezierCurveTo(cx + wr * 1.03, by - L * 0.9, cx + wr * 0.5, ty + L * 0.008, cx + nw, ty + nd * 0.1);
  // 끝의 작고 얕은 V 홈
  path.lineTo(cx, ty + nd);
  path.lineTo(cx - nw, ty + nd * 0.1);
  // 왼쪽
  path.bezierCurveTo(cx - wl * 0.5, ty + L * 0.008, cx - wl * 1.03, by - L * 0.9, cx - wl * 0.99, by - L * 0.72);
  path.bezierCurveTo(cx - wl * 0.92, by - L * 0.46, cx - wl * 0.4, by - L * 0.2, cx - claw, by - L * 0.03);
  path.closePath();

  // 밑동 쪽이 조금 더 진한 분홍, 끝으로 갈수록 거의 흰색
  const g = ctx.createLinearGradient(0, by, 0, ty);
  g.addColorStop(0, v.base);
  g.addColorStop(0.35, v.mid);
  g.addColorStop(1, v.tip);
  ctx.fillStyle = g;
  ctx.fill(path);

  ctx.save();
  ctx.clip(path);
  // 꽃잎이 살짝 오목하게 휜 느낌: 양옆 가장자리를 아주 약간 어둡게
  const side = ctx.createLinearGradient(cx - wl, 0, cx + wr, 0);
  side.addColorStop(0, 'rgba(190,110,140,0.22)');
  side.addColorStop(0.3, 'rgba(255,255,255,0)');
  side.addColorStop(0.7, 'rgba(255,255,255,0)');
  side.addColorStop(1, 'rgba(190,110,140,0.18)');
  ctx.fillStyle = side;
  ctx.fillRect(0, 0, s, s);
  // 밑동에서 부채꼴로 퍼지는 가는 잎맥
  ctx.strokeStyle = 'rgba(214,140,168,0.22)';
  ctx.lineWidth = s * 0.012;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(cx, by - L * 0.04);
    ctx.quadraticCurveTo(cx + i * wl * 0.25, by - L * 0.5, cx + i * wl * 0.42, ty + L * 0.12);
    ctx.stroke();
  }
  ctx.restore();
}

const SAKURA_VARIANTS = 8;

function buildSakuraSprites() {
  const palettes = [
    { base: 'rgba(244,184,204,0.97)', mid: 'rgba(252,222,232,0.96)', tip: 'rgba(255,246,249,0.96)' },
    { base: 'rgba(238,166,192,0.97)', mid: 'rgba(250,210,224,0.96)', tip: 'rgba(255,240,245,0.96)' },
    { base: 'rgba(248,204,218,0.97)', mid: 'rgba(254,234,240,0.96)', tip: 'rgba(255,252,252,0.96)' },
    { base: 'rgba(232,150,182,0.97)', mid: 'rgba(246,196,214,0.96)', tip: 'rgba(253,232,240,0.96)' },
  ];
  const size = 64;
  const pad = 12; // 흐림 여백
  const sprites = [];
  for (let i = 0; i < SAKURA_VARIANTS; i++) {
    const v = {
      ...palettes[i % palettes.length],
      width: rand(0.25, 0.33),
      notch: rand(0.025, 0.065),
      asym: rand(-0.12, 0.12),
      lean: rand(-1, 1),
    };
    const sharp = makeCanvas(size + pad * 2);
    const sctx = sharp.getContext('2d');
    sctx.translate(pad, pad);
    drawPetal(sctx, size, v);

    let blurred = sharp;
    if (supportsCanvasFilter) {
      blurred = makeCanvas(size + pad * 2);
      const bctx = blurred.getContext('2d');
      bctx.filter = 'blur(4px)';
      bctx.drawImage(sharp, 0, 0);
    }
    sprites.push({ sharp, blurred });
  }
  return sprites;
}

function buildFireflySprite() {
  return softDot(64, [
    [0, 'rgba(255,255,235,1)'],
    [0.2, 'rgba(245,255,180,1)'],
    [0.42, 'rgba(215,245,120,0.6)'],
    [0.7, 'rgba(185,225,85,0.15)'],
    [1, 'rgba(180,220,80,0)'],
  ]);
}

/* ── 바람 ─────────────────────────────────── */

// 천천히 세기가 바뀌는 돌풍 (+ 약간 오른쪽으로 치우침)
function windAt(t) {
  return 0.18 + 0.35 * Math.sin(t * 0.00021) + 0.22 * Math.sin(t * 0.00057 + 1.3) + 0.08 * Math.sin(t * 0.0019 + 0.4);
}

// 벚꽃용 바람: 꽃잎은 가벼워 바람에 크게 밀리므로, 방향이 거의 바뀌지 않고 아주 천천히 세기만 바뀌는 산들바람
// (주기 약 1분 · 25초, 항상 오른쪽으로 부는 쪽)
function sakuraWindAt(t) {
  return 0.34 + 0.2 * Math.sin(t * 0.00011) + 0.09 * Math.sin(t * 0.00027 + 1.3);
}

/* ── 파티클 생성 ─────────────────────────────── */

function createParticle(effect, w, h, initial) {
  switch (effect) {
    case 'snow': {
      const z = randDepth(1.7);
      return {
        z,
        x: rand(-w * 0.1, w * 1.1),
        y: initial ? rand(-h * 0.05, h) : rand(-40, -10),
        size: 2.3 + z * z * 13, // 지름 (멀리 있어도 최소 2.3px)
        vy: 0.22 + z * 1.25,
        phase: rand(0, Math.PI * 2),
        freq: rand(0.006, 0.016),
        sway: 0.15 + z * 0.75,
        alpha: z > 0.85 ? rand(0.25, 0.4) : 0.55 + z * 0.45,
        sprite: z > 0.85 ? 'bokeh' : z > 0.5 ? 'soft' : 'crisp',
      };
    }
    case 'rain': {
      const z = randDepth(1.5);
      return {
        z,
        x: rand(-w * 0.2, w * 1.1),
        y: initial ? rand(-h * 0.1, h) : rand(-h * 0.3, -20),
        len: 12 + z * 40,
        width: 0.7 + z * 1.2,
        vy: 5.5 + z * 6,
        alpha: 0.16 + z * 0.34,
      };
    }
    case 'sakura': {
      const z = randDepth(1.4);
      return {
        z,
        x: rand(-w * 0.25, w),
        y: initial ? rand(-h * 0.05, h) : rand(-60, -20),
        size: 6 + z * 15.5,
        vy: 0.45 + z * 0.95,
        flip: rand(0, Math.PI * 2),
        vflip: rand(0.018, 0.045),
        rot: rand(0, Math.PI * 2),
        vrot: rand(-0.02, 0.02),
        drift: rand(0, Math.PI * 2),
        alpha: z > 0.82 ? 0.75 : 0.55 + z * 0.4,
        tint: Math.floor(Math.random() * SAKURA_VARIANTS),
        aspect: rand(0.85, 1.15), // 꽃잎마다 폭을 조금씩 다르게
        blurred: z > 0.82,
      };
    }
    case 'fireflies':
    default: {
      const z = randDepth(1.3);
      return {
        z,
        x: rand(0, w),
        y: rand(h * 0.3, h * 0.98),
        heading: rand(0, Math.PI * 2),
        speed: 0.12 + z * 0.32,
        size: 9 + z * 17,
        period: rand(2400, 4500),
        on: rand(1600, 2800),
        offset: rand(0, 7000),
      };
    }
  }
}

/* ── 프레임 그리기 ─────────────────────────────── */

function drawFrame(state, dt) {
  const { ctx, effect, particles, w, h, dpr, sprites, surfaces } = state;
  const speed = state.speed;
  const scale = state.sizeScale;
  state.time += dt * (1000 / 60);
  const t = state.time;
  const wind = effect === 'sakura' ? sakuraWindAt(t) : windAt(t);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, w, h);

  // 표면에 쌓인 눈 · 튄 물방울 · 내려앉은 꽃잎은 콘텐츠 위 캔버스에 그림
  // 렌즈 가까이 지나가는 큰 입자(fg)도 그 위에 그려서 LP판 · 미니플레이어 앞으로 떨어지게 함
  if (surfaces) surfaces.update(dt, { speed, wind });
  const fctx = surfaces ? surfaces.beginForeground() : null;

  if (effect === 'snow') {
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.phase += p.freq * dt;
      const prevY = p.y;
      p.y += p.vy * dt * speed;
      p.x += (wind * (0.35 + p.z * 1.1) + Math.sin(p.phase) * p.sway) * dt * speed;
      const d = p.size * scale;
      // 렌즈 가까이 지나가는 보케·아주 먼 입자는 표면에 닿지 않고 지나감
      const fg = fctx && p.z > FG_DEPTH.snow;
      if (surfaces && !fg && p.z > 0.1 && surfaces.tryLand(p, prevY, d)) {
        Object.assign(p, createParticle(effect, w, h, false));
        continue;
      }
      if (p.y - d > h) Object.assign(p, createParticle(effect, w, h, false));
      if (p.x < -w * 0.15) p.x += w * 1.3;
      else if (p.x > w * 1.15) p.x -= w * 1.3;
      const c = fg ? fctx : ctx;
      c.globalAlpha = p.alpha;
      c.drawImage(sprites[p.sprite], p.x - d / 2, p.y - d / 2, d, d);
    }
  } else if (effect === 'rain') {
    const angle = -(0.06 + wind * 0.1); // 바람 방향으로 기울어진 빗줄기
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const step = p.vy * dt * speed;
      const prevY = p.y;
      p.y += step * cos;
      p.x -= step * sin;
      const len = p.len * scale;
      const fg = fctx && p.z > FG_DEPTH.rain;
      if (surfaces && !fg && p.z > 0.15 && surfaces.tryLand(p, prevY, p.width)) {
        Object.assign(p, createParticle(effect, w, h, false));
        continue;
      }
      if (p.y - len > h || p.x > w * 1.2) Object.assign(p, createParticle(effect, w, h, false));
      const c = fg ? fctx : ctx;
      c.globalAlpha = p.alpha;
      c.setTransform(dpr * cos, dpr * sin, -dpr * sin, dpr * cos, p.x * dpr, p.y * dpr);
      c.drawImage(sprites, -p.width / 2, -len, p.width, len);
    }
  } else if (effect === 'sakura') {
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.flip += p.vflip * dt;
      p.rot += p.vrot * dt;
      p.drift += 0.008 * dt;
      // 꽃잎이 평평하게 누울수록(공기 저항) 천천히 떨어짐
      const flat = Math.abs(Math.cos(p.flip));
      const prevY = p.y;
      p.y += p.vy * (0.55 + 0.45 * (1 - flat)) * dt * speed;
      p.x += (wind * (0.6 + p.z * 1.2) + Math.sin(p.drift) * 0.28 * (0.4 + p.z)) * dt * speed;
      const s = p.size * scale;
      const fg = fctx && p.blurred;
      if (surfaces && !fg && !p.blurred && surfaces.tryLand(p, prevY, s)) {
        Object.assign(p, createParticle(effect, w, h, false));
        continue;
      }
      if (p.y - s > h || p.x - s > w * 1.1) Object.assign(p, createParticle(effect, w, h, false));
      const sx = Math.max(0.12, flat) * p.aspect;
      const cos = Math.cos(p.rot);
      const sin = Math.sin(p.rot);
      const sprite = p.blurred ? sprites[p.tint].blurred : sprites[p.tint].sharp;
      const full = s * (sprite.width / 64);
      const c = fg ? fctx : ctx;
      c.globalAlpha = p.alpha;
      c.setTransform(dpr * cos * sx, dpr * sin * sx, -dpr * sin, dpr * cos, p.x * dpr, p.y * dpr);
      c.drawImage(sprite, -full / 2, -full / 2, full, full);
    }
  } else if (effect === 'fireflies') {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.heading += rand(-0.06, 0.06) * dt;
      // 화면 아래쪽 2/3 영역에 머물도록 부드럽게 방향 보정
      if (p.y < h * 0.3) p.heading += (Math.PI / 2 - p.heading) * 0.02 * dt;
      if (p.x < 0 || p.x > w) {
        p.x = Math.max(0, Math.min(w, p.x));
        p.heading = Math.PI - p.heading;
      }
      if (p.y > h) {
        p.y = h;
        p.heading = -Math.PI / 2;
      }
      p.x += Math.cos(p.heading) * p.speed * dt * speed;
      p.y += Math.sin(p.heading) * p.speed * dt * speed;

      // 깜빡임: 대부분 희미하다가 주기적으로 부드럽게 켜졌다 꺼짐
      const local = (t + p.offset) % p.period;
      const pulse = local < p.on ? Math.pow(Math.sin((Math.PI * local) / p.on), 2) : 0;
      const glow = 0.35 + pulse * 0.65;
      const d = p.size * scale * (0.75 + 0.25 * pulse);
      ctx.globalAlpha = glow * (0.75 + 0.25 * p.z);
      ctx.drawImage(sprites, p.x - d / 2, p.y - d / 2, d, d);
    }
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  if (fctx) surfaces.endForeground();
}

function buildSprites(effect) {
  switch (effect) {
    case 'snow': return buildSnowSprites();
    case 'rain': return buildRainSprite();
    case 'sakura': return buildSakuraSprites();
    case 'fireflies': return buildFireflySprite();
    default: return null;
  }
}

export default function ParticleEffect({ effect = 'none', intensity = 'medium', className = '', interactive = false }) {
  const canvasRef = useRef(null);
  const frontCanvasRef = useRef(null);
  // 실제 Now Playing 화면에서만 LP·미니플레이어와 상호작용 (테마 편집기 미리보기는 제외)
  const withSurfaces = interactive && supportsSurfaces(effect);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !DENSITY[effect]) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const reducedMotion = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const state = {
      ctx,
      effect,
      particles: [],
      w: 1,
      h: 1,
      dpr: 1,
      speed: 1,
      sizeScale: 1,
      time: Math.random() * 100000,
      sprites: buildSprites(effect),
      surfaces: null,
    };
    const frontCanvas = frontCanvasRef.current;
    if (withSurfaces && frontCanvas && !reducedMotion) {
      // 효과가 많을수록 표면에 닿는 입자도 많으므로 한 번에 쌓이는 양을 줄임 ("적게" 기준)
      const density = DENSITY[effect][intensity] ?? DENSITY[effect].medium;
      const accumScale = Math.pow(DENSITY[effect].low / density, 0.75);
      state.surfaces = createSurfaceSystem(effect, frontCanvas, state.sprites, { accumScale });
    }
    let rafId = null;
    let lastTime = 0;

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) return;
      state.dpr = Math.min(window.devicePixelRatio || 1, 2);
      state.w = Math.max(1, rect.width);
      state.h = Math.max(1, rect.height);
      canvas.width = Math.round(state.w * state.dpr);
      canvas.height = Math.round(state.h * state.dpr);
      // 작은 미리보기에서도 큰 화면과 비슷한 체감이 나도록 높이에 비례해 속도/크기 보정
      state.speed = Math.max(0.35, Math.min(1.4, state.h / 850));
      state.sizeScale = Math.max(0.4, Math.min(1.2, state.h / 900));
      if (state.surfaces) state.surfaces.resize(state.w, state.h, state.dpr);

      const density = DENSITY[effect][intensity] ?? DENSITY[effect].medium;
      const target = Math.min(MAX_PARTICLES, Math.round(((state.w * state.h) / 100000) * density));
      if (state.particles.length > target) {
        state.particles.length = target;
      } else {
        while (state.particles.length < target) {
          state.particles.push(createParticle(effect, state.w, state.h, true));
        }
      }
      if (reducedMotion) drawFrame(state, 0);
    };

    const loop = (time) => {
      const dt = lastTime ? Math.min(3, (time - lastTime) / (1000 / 60)) : 1;
      lastTime = time;
      drawFrame(state, dt);
      rafId = requestAnimationFrame(loop);
    };

    const start = () => {
      if (reducedMotion || rafId !== null) return;
      lastTime = 0;
      rafId = requestAnimationFrame(loop);
    };
    const stop = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
    };
    const handleVisibility = () => (document.hidden ? stop() : start());

    resize();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    if (observer && canvas.parentElement) observer.observe(canvas.parentElement);
    else window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', handleVisibility);
    if (!document.hidden) start();

    return () => {
      stop();
      if (observer) observer.disconnect();
      else window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (state.surfaces) state.surfaces.destroy();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [effect, intensity, withSurfaces]);

  if (!DENSITY[effect]) return null;
  return (
    <>
      <canvas ref={canvasRef} className={`np-particle-canvas ${className}`} aria-hidden="true" />
      {withSurfaces && createPortal(
        <canvas ref={frontCanvasRef} className="np-particle-front-canvas" aria-hidden="true" />,
        document.body
      )}
    </>
  );
}
