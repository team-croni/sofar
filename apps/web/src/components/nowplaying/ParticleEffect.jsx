import React, { useEffect, useRef } from 'react';
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

function drawPetal(ctx, s, tint) {
  // 끝이 살짝 갈라진 벚꽃잎 (아래가 꽃잎 밑동, 위가 갈라진 끝)
  ctx.beginPath();
  ctx.moveTo(s * 0.5, s * 0.95);
  ctx.bezierCurveTo(s * 0.06, s * 0.72, s * 0.04, s * 0.22, s * 0.36, s * 0.07);
  ctx.quadraticCurveTo(s * 0.45, s * 0.16, s * 0.5, s * 0.2);
  ctx.quadraticCurveTo(s * 0.55, s * 0.16, s * 0.64, s * 0.07);
  ctx.bezierCurveTo(s * 0.96, s * 0.22, s * 0.94, s * 0.72, s * 0.5, s * 0.95);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, s * 0.95, 0, s * 0.05);
  g.addColorStop(0, tint.base);
  g.addColorStop(0.55, tint.mid);
  g.addColorStop(1, tint.edge);
  ctx.fillStyle = g;
  ctx.fill();
}

function buildSakuraSprites() {
  const tints = [
    { base: 'rgba(255,248,250,0.98)', mid: 'rgba(252,214,226,0.95)', edge: 'rgba(240,168,192,0.95)' },
    { base: 'rgba(255,240,244,0.98)', mid: 'rgba(248,200,216,0.95)', edge: 'rgba(232,150,178,0.95)' },
    { base: 'rgba(255,252,252,0.98)', mid: 'rgba(255,226,234,0.95)', edge: 'rgba(246,186,204,0.95)' },
  ];
  const size = 64;
  const pad = 12; // 흐림 여백
  return tints.map((tint) => {
    const sharp = makeCanvas(size + pad * 2);
    const sctx = sharp.getContext('2d');
    sctx.translate(pad, pad);
    drawPetal(sctx, size, tint);

    let blurred = sharp;
    if (supportsCanvasFilter) {
      blurred = makeCanvas(size + pad * 2);
      const bctx = blurred.getContext('2d');
      bctx.filter = 'blur(4px)';
      bctx.drawImage(sharp, 0, 0);
    }
    return { sharp, blurred };
  });
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
        tint: Math.floor(Math.random() * 3),
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
  const { ctx, effect, particles, w, h, dpr, sprites } = state;
  const speed = state.speed;
  const scale = state.sizeScale;
  state.time += dt * (1000 / 60);
  const t = state.time;
  const wind = windAt(t);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, w, h);

  if (effect === 'snow') {
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.phase += p.freq * dt;
      p.y += p.vy * dt * speed;
      p.x += (wind * (0.35 + p.z * 1.1) + Math.sin(p.phase) * p.sway) * dt * speed;
      const d = p.size * scale;
      if (p.y - d > h) Object.assign(p, createParticle(effect, w, h, false));
      if (p.x < -w * 0.15) p.x += w * 1.3;
      else if (p.x > w * 1.15) p.x -= w * 1.3;
      ctx.globalAlpha = p.alpha;
      ctx.drawImage(sprites[p.sprite], p.x - d / 2, p.y - d / 2, d, d);
    }
  } else if (effect === 'rain') {
    const angle = -(0.06 + wind * 0.1); // 바람 방향으로 기울어진 빗줄기
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const step = p.vy * dt * speed;
      p.y += step * cos;
      p.x -= step * sin;
      const len = p.len * scale;
      if (p.y - len > h || p.x > w * 1.2) Object.assign(p, createParticle(effect, w, h, false));
      ctx.globalAlpha = p.alpha;
      ctx.setTransform(dpr * cos, dpr * sin, -dpr * sin, dpr * cos, p.x * dpr, p.y * dpr);
      ctx.drawImage(sprites, -p.width / 2, -len, p.width, len);
    }
  } else if (effect === 'sakura') {
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.flip += p.vflip * dt;
      p.rot += p.vrot * dt;
      p.drift += 0.012 * dt;
      // 꽃잎이 평평하게 누울수록(공기 저항) 천천히 떨어짐
      const flat = Math.abs(Math.cos(p.flip));
      p.y += p.vy * (0.55 + 0.45 * (1 - flat)) * dt * speed;
      p.x += (wind * (0.7 + p.z * 1.6) + Math.sin(p.drift) * 0.35 * (0.4 + p.z)) * dt * speed;
      const s = p.size * scale;
      if (p.y - s > h || p.x - s > w * 1.1) Object.assign(p, createParticle(effect, w, h, false));
      const sx = Math.max(0.12, flat);
      const cos = Math.cos(p.rot);
      const sin = Math.sin(p.rot);
      const sprite = p.blurred ? sprites[p.tint].blurred : sprites[p.tint].sharp;
      const full = s * (sprite.width / 64);
      ctx.globalAlpha = p.alpha;
      ctx.setTransform(dpr * cos * sx, dpr * sin * sx, -dpr * sin, dpr * cos, p.x * dpr, p.y * dpr);
      ctx.drawImage(sprite, -full / 2, -full / 2, full, full);
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

export default function ParticleEffect({ effect = 'none', intensity = 'medium', className = '' }) {
  const canvasRef = useRef(null);

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
    };
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
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [effect, intensity]);

  if (!DENSITY[effect]) return null;
  return <canvas ref={canvasRef} className={`np-particle-canvas ${className}`} aria-hidden="true" />;
}
