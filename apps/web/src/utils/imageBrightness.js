/**
 * 배경 이미지 밝기 측정 (가사 글자색 자동 전환용)
 *
 * 1) loadBrightnessSampler(url): 이미지를 작게 줄여 픽셀 밝기 배열로 보관 (같은 이미지는 캐시)
 *    이미지 서버가 CORS를 허용하지 않아 픽셀을 읽을 수 없으면 null
 * 2) sampleRegionBrightness(sampler, region): 이미지의 특정 영역(0~1 비율 좌표) 밝기
 *    평균이 아니라 상위 25% 밝기(75번째 백분위): 밝은 부분이 일부만 있어도 그 위의 글자는 안 보이기 때문
 * 3) viewportRectToImageRegion(): 화면 위 요소 위치를 background-size: cover 로 깔린 이미지 좌표로 변환
 */

const MAX_SAMPLE_SIDE = 256;
const cache = new Map();

export function loadBrightnessSampler(url) {
  if (!url) return Promise.resolve(null);
  if (cache.has(url)) return cache.get(url);

  const promise = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      try {
        const ratio = Math.min(1, MAX_SAMPLE_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
        const width = Math.max(1, Math.round(img.naturalWidth * ratio));
        const height = Math.max(1, Math.round(img.naturalHeight * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, width, height);
        const { data } = ctx.getImageData(0, 0, width, height);

        // 픽셀별 밝기 (사람 눈 기준, Rec. 709)
        const luma = new Float32Array(width * height);
        for (let i = 0, p = 0; i < data.length; i += 4, p++) {
          luma[p] = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
        }
        resolve({ width, height, luma, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
      } catch (e) {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });

  cache.set(url, promise);
  return promise;
}

/**
 * @param sampler loadBrightnessSampler 결과
 * @param region { x0, y0, x1, y1 } 이미지 기준 0~1 비율 좌표
 * @returns 0(검정) ~ 1(흰색), 영역이 이미지 밖이면 null
 */
export function sampleRegionBrightness(sampler, region) {
  const { width, height, luma } = sampler;
  const x0 = Math.max(0, Math.floor(region.x0 * width));
  const y0 = Math.max(0, Math.floor(region.y0 * height));
  const x1 = Math.min(width, Math.ceil(region.x1 * width));
  const y1 = Math.min(height, Math.ceil(region.y1 * height));
  if (x1 <= x0 || y1 <= y0) return null;

  const values = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) values.push(luma[y * width + x]);
  }
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length * 0.75)] ?? null;
}

/**
 * 화면(viewport) 좌표 사각형 → background-size: cover; background-position: center 로
 * 박스(box)에 깔린 이미지의 0~1 비율 좌표
 */
export function viewportRectToImageRegion(rect, box, naturalWidth, naturalHeight) {
  const scale = Math.max(box.width / naturalWidth, box.height / naturalHeight);
  const drawnW = naturalWidth * scale;
  const drawnH = naturalHeight * scale;
  const offsetX = box.left + (box.width - drawnW) / 2;
  const offsetY = box.top + (box.height - drawnH) / 2;
  return {
    x0: (rect.left - offsetX) / drawnW,
    y0: (rect.top - offsetY) / drawnH,
    x1: (rect.right - offsetX) / drawnW,
    y1: (rect.bottom - offsetY) / drawnH,
  };
}

/**
 * 비네트(.np-vignette)가 화면의 (px, py) 지점(0~1)을 얼마나 어둡게 하는지 → 남는 밝기 비율(0~1)
 * CSS와 같은 구성: 위/아래 선형 그라데이션 + 가운데가 투명한 타원형 그라데이션
 */
export function vignetteFactorAt(px, py) {
  const edge = (t) => {
    if (t < 0.15) return 0.85 + (0.3 - 0.85) * (t / 0.15);
    if (t < 0.4) return 0.3 * (1 - (t - 0.15) / 0.25);
    return 0;
  };
  const top = edge(py);
  const bottom = edge(1 - py);
  // radial-gradient(ellipse at center, ...): 모서리까지가 100%
  const d = Math.sqrt(((px - 0.5) / (0.5 * Math.SQRT2)) ** 2 + ((py - 0.5) / (0.5 * Math.SQRT2)) ** 2);
  const radial = d < 0.45 ? 0 : 0.7 * Math.min(1, (d - 0.45) / 0.55);
  return (1 - top) * (1 - bottom) * (1 - radial);
}
