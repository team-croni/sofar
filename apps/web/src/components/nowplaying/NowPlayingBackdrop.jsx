import React, { useEffect, useState } from 'react';
import ParticleEffect from './ParticleEffect';
import { BACKGROUND_MAX_BLUR_PX, backgroundFilter } from '../../utils/nowPlayingTheme';
import { useAdaptiveTextContrast } from '../../hooks/useAdaptiveTextContrast';
import './NowPlayingBackdrop.css';

/**
 * Now Playing 화면 전용 배경 레이어
 * - 플레이리스트 테마의 배경 이미지 + 흐림 + 흑백 + 어둡기 + 비네트 + 필름 질감 + 파티클 효과
 * - 배경 이미지는 다 받아진 뒤에 서서히 나타나고,
 *   눈/비 같은 효과는 배경이 나타나기 시작한 뒤에 이어서 서서히 나타남
 *   (새로고침 시 빈 화면에 효과만 먼저 보이는 문제 방지)
 */
export default function NowPlayingBackdrop({ theme, active }) {
  const background = active ? theme.background : '';
  const hasEffect = active && theme.effect !== 'none';
  const [loadedUrl, setLoadedUrl] = useState('');

  // 배경 이미지 미리 받기
  useEffect(() => {
    if (!background) return undefined;
    let cancelled = false;
    const img = new Image();
    const done = () => {
      if (!cancelled) setLoadedUrl(background);
    };
    img.onload = done;
    img.onerror = done; // 실패해도 효과는 보여줌
    img.src = background;
    if (img.complete) done();
    return () => {
      cancelled = true;
    };
  }, [background]);

  // 실제 가사·곡 정보가 놓인 자리의 배경 밝기에 맞춰 글자색을 흰색으로 자동 전환
  useAdaptiveTextContrast({
    background,
    dim: theme.dim,
    blur: theme.blur,
    vignette: theme.vignette,
    enabled: active,
  });

  const isBackgroundReady = Boolean(background) && loadedUrl === background;
  // 배경 이미지가 있으면 로드 후에, 없으면(앨범 커버 블러 배경) 바로 효과 레이어를 올림
  const showEffect = hasEffect && (!background || isBackgroundReady);
  const blurPx = (theme.blur || 0) * BACKGROUND_MAX_BLUR_PX;

  return (
    <>
      {isBackgroundReady && (
        <div className="np-backdrop" aria-hidden="true">
          <div
            key={background}
            className="np-backdrop-image fade-in-bg"
            style={{
              backgroundImage: `url("${background.replace(/"/g, '%22')}")`,
              filter: backgroundFilter(blurPx, theme.grayscale),
            }}
          />
          <div className="np-backdrop-dim" style={{ opacity: theme.dim }} />
          {/* 비네트 (기본 켜짐): 기본(앨범 커버) 배경과 같은 구성으로 가장자리를 어둡게 해서 시선을 가운데로 */}
          {theme.vignette && <div className="np-vignette" />}
        </div>
      )}

      {/* 필름 질감: 배경 위, 화면 콘텐츠 뒤 (LP·가사는 선명하게 유지) */}
      {active && theme.grain && (!background || isBackgroundReady) && (
        <div className="np-grain-layer" aria-hidden="true">
          <div className="np-grain" />
        </div>
      )}

      {showEffect && (
        <div className="np-effect-layer" aria-hidden="true">
          <ParticleEffect effect={theme.effect} intensity={theme.intensity} interactive />
        </div>
      )}
    </>
  );
}
