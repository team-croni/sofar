import { useEffect } from 'react';
import {
  loadBrightnessSampler,
  sampleRegionBrightness,
  viewportRectToImageRegion,
  vignetteFactorAt,
} from '../utils/imageBrightness';
import { BACKGROUND_MAX_BLUR_PX } from '../utils/nowPlayingTheme';

/**
 * 실제 글자가 놓인 위치의 배경 밝기에 맞춰 글자색을 자동 전환
 *
 * - 곡 정보(제목·아티스트)와 가사 영역의 "화면 위 실제 위치"를 구해서
 *   그 바로 뒤에 깔린 배경 이미지 부분의 밝기를 측정
 *   (cover 크롭, 흐림, 배경 어둡기, 그 지점의 비네트까지 반영)
 * - 밝으면 <html>에 영역별 클래스를 붙여 흰색 + 그림자로 표시 (CSS: NowPlayingBackdrop.css)
 * - 창 크기, 레이아웃(가사 숨김·확대, 곡 전환), 스크롤이 바뀔 때마다 다시 측정
 * - 이미지 픽셀을 읽을 수 없으면(CORS 미허용) 안전하게 흰색
 */

const TEXT_REGIONS = [
  {
    className: 'np-contrast-track',
    selectors: ['.now-playing-container .vinyl-player-card .track-info'],
  },
  {
    className: 'np-contrast-lyrics',
    selectors: [
      '.now-playing-container .lyrics-card.visible .lyrics-viewport',
      '.now-playing-container .lyrics-card.visible',
    ],
  },
];

// 글자 뒤 배경의 실제 밝기(상위 25%, 0~1)가 이보다 밝으면 회색 글자의 대비가 부족함
const BRIGHT_BACKGROUND_THRESHOLD = 0.2;

function findVisibleElement(selectors) {
  for (const selector of selectors) {
    for (const el of document.querySelectorAll(selector)) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return { el, rect };
    }
  }
  return null;
}

export function useAdaptiveTextContrast({ background, dim = 0, blur = 0, vignette = true, enabled }) {
  useEffect(() => {
    const root = document.documentElement;
    const clearAll = () => TEXT_REGIONS.forEach((r) => root.classList.remove(r.className));

    if (!enabled || !background) {
      clearAll();
      return undefined;
    }

    let cancelled = false;
    let sampler; // undefined: 로딩 중, null: 픽셀을 읽을 수 없음
    let timer = null;

    const measure = () => {
      if (cancelled || sampler === undefined) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // .np-backdrop-image 는 inset: -2% 로 화면보다 살짝 크게 깔림
      const box = { left: -0.02 * vw, top: -0.02 * vh, width: 1.04 * vw, height: 1.04 * vh };
      const blurPx = blur * BACKGROUND_MAX_BLUR_PX;

      TEXT_REGIONS.forEach(({ className, selectors }) => {
        const found = findVisibleElement(selectors);
        if (!found) {
          root.classList.remove(className);
          return;
        }
        if (!sampler) {
          root.classList.add(className);
          return;
        }

        const { rect } = found;
        // 흐림이 있으면 주변 색이 섞이므로 그만큼 넓혀서 측정
        const expanded = {
          left: rect.left - blurPx,
          top: rect.top - blurPx,
          right: rect.right + blurPx,
          bottom: rect.bottom + blurPx,
        };
        const region = viewportRectToImageRegion(expanded, box, sampler.naturalWidth, sampler.naturalHeight);
        const brightness = sampleRegionBrightness(sampler, region);
        if (brightness == null) {
          root.classList.add(className);
          return;
        }

        const cx = (rect.left + rect.right) / 2 / vw;
        const cy = (rect.top + rect.bottom) / 2 / vh;
        const vignetteFactor = vignette ? vignetteFactorAt(cx, cy) : 1;
        const effective = brightness * (1 - dim) * vignetteFactor;
        root.classList.toggle(className, effective > BRIGHT_BACKGROUND_THRESHOLD);
      });
    };

    // 레이아웃 변화가 몰려올 때 마지막 한 번만 측정
    // (requestAnimationFrame은 백그라운드 탭에서 멈추므로 타이머만 사용)
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(measure, 120);
    };

    loadBrightnessSampler(background).then((result) => {
      if (cancelled) return;
      sampler = result;
      measure();
    });

    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);

    const container = document.querySelector('.right-main-content') || document.body;
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    resizeObserver?.observe(container);
    // 곡 전환으로 가사가 다시 그려지거나, 가사 숨김·확대처럼 클래스가 바뀌는 경우
    const mutationObserver = new MutationObserver(schedule);
    mutationObserver.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
      clearAll();
    };
  }, [background, dim, blur, vignette, enabled]);
}
