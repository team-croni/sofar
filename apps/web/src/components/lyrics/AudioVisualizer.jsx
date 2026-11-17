import React, { useEffect, useRef } from 'react';
import './AudioVisualizer.css';

/**
 * 오디오 비주얼라이저 (시뮬레이션)
 *
 * 유튜브 임베드는 오디오 신호에 접근할 수 없어서 실제 분석 대신
 * 실제 스펙트럼 미터처럼 보이도록 움직임을 만든다.
 * - 바닥에서 위로 자라는 막대, 왼쪽 저음 → 오른쪽 고음 (대칭 아님)
 * - 저음은 크고 묵직하게, 중음(보컬대)은 살짝 도드라지게, 고음은 작고 빠르게
 * - 대역마다 독립적인 노이즈 + 저음 펀치 → 매 순간 실루엣이 달라짐
 * - 쉬는 대역은 바닥까지 내려가 '빗' 모양이 생기지 않음
 * - 빠르게 올라가고 천천히 내려오는 계측기식 감쇠, 일시정지 시 천천히 가라앉음
 * React 리렌더 없이 requestAnimationFrame에서 transform만 갱신한다.
 */

const BAR_COUNT = 18;

// 1D 값 노이즈 (부드러운 보간)
function makeNoise(seed) {
  const values = Array.from({ length: 256 }, (_, i) => {
    const x = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453;
    return x - Math.floor(x);
  });
  return (t) => {
    const i = Math.floor(t);
    const f = t - i;
    const a = values[i & 255];
    const b = values[(i + 1) & 255];
    const u = f * f * (3 - 2 * f);
    return a + (b - a) * u;
  };
}

export default function AudioVisualizer({ isPlaying }) {
  const barsRef = useRef([]);
  const playingRef = useRef(isPlaying);
  playingRef.current = isPlaying;

  useEffect(() => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const bands = Array.from({ length: BAR_COUNT }, (_, i) => {
      const p = i / (BAR_COUNT - 1); // 0 = 저음, 1 = 고음
      const vocalBump = Math.exp(-((p - 0.38) ** 2) / 0.02) * 0.18;
      return {
        noise: makeNoise(i * 3.17 + 1),
        detail: makeNoise(i * 7.41 + 5),
        gate: makeNoise(i * 1.93 + 11),
        // 자연스러운 스펙트럼 기울기(고음일수록 작음) + 보컬 대역 살짝 강조
        envelope: 0.95 - p * 0.6 + vocalBump,
        speed: 0.9 + p * 3.4,
        level: 0,
      };
    });

    let rafId = 0;
    let last = performance.now();
    let elapsed = Math.random() * 100;
    let punch = 0;
    let nextPunchAt = 0.3;
    let energy = 0.7;
    const energyNoise = makeNoise(99);

    const render = () => {
      for (let i = 0; i < BAR_COUNT; i++) {
        const el = barsRef.current[i];
        if (!el) continue;
        const scale = Math.max(0.02, Math.min(1, bands[i].level));
        el.style.transform = `scaleY(${scale.toFixed(3)})`;
        el.style.opacity = (0.3 + scale * 0.6).toFixed(3);
      }
    };

    if (reduceMotion) {
      bands.forEach((b) => { b.level = 0.15 * b.envelope; });
      render();
      return undefined;
    }

    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const playing = playingRef.current;

      if (playing) {
        elapsed += dt;

        // 저음 펀치: 박자 간격 근처로 불규칙하게, 세기도 매번 다름
        nextPunchAt -= dt;
        if (nextPunchAt <= 0) {
          if (Math.random() > 0.25) punch = Math.max(punch, 0.35 + Math.random() * 0.5);
          nextPunchAt = 0.38 + Math.random() * 0.3;
        }
        punch *= Math.exp(-dt * 6);

        // 곡 전체 에너지가 몇 초 단위로 천천히 오르내림 (조용한 구간 / 큰 구간)
        const energyTarget = 0.6 + energyNoise(elapsed * 0.15) * 0.4;
        energy += (energyTarget - energy) * Math.min(1, dt * 0.7);
      }

      const targets = bands.map((b, i) => {
        if (!playing) return 0;
        const p = i / (BAR_COUNT - 1);
        const n = b.noise(elapsed * b.speed) * 0.65 + b.detail(elapsed * b.speed * 2.6) * 0.35;
        // 대역이 가끔 잦아들도록 게이트 (완전히 꺼지는 일은 드묾)
        const gate = Math.min(1, Math.max(0.15, (b.gate(elapsed * 0.3) - 0.08) * 1.9));
        const shaped = Math.pow(n, 1.25); // 높이가 고르게 퍼지지 않도록 살짝 눌러줌
        const lowWeight = Math.max(0, 1 - p * 3.2);
        return b.envelope * energy * (0.12 + shaped * 0.95) * gate + punch * lowWeight * 0.55;
      });

      for (let i = 0; i < BAR_COUNT; i++) {
        const b = bands[i];
        // 이웃 대역과 약하게 연결 (실제 스펙트럼처럼 인접 대역이 비슷하게 움직임)
        const prev = targets[i - 1] ?? targets[i];
        const next = targets[i + 1] ?? targets[i];
        const target = targets[i] * 0.74 + (prev + next) * 0.13;
        // 빠르게 올라가고 천천히 내려옴 (일시정지 시 더 천천히)
        const rate = target > b.level ? 16 : playing ? 4.5 : 2;
        b.level += (target - b.level) * Math.min(1, dt * rate);
      }

      render();
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div className={`audio-visualizer ${isPlaying ? 'is-playing' : 'is-paused'}`} aria-hidden="true">
      {Array.from({ length: BAR_COUNT }).map((_, i) => (
        <span
          key={i}
          className="audio-visualizer-bar"
          ref={(el) => { barsRef.current[i] = el; }}
        />
      ))}
    </div>
  );
}
