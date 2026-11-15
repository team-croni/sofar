/**
 * 이미지 검색 (Openverse API)
 * - API 키 없이 브라우저에서 바로 호출 가능 (CORS 허용)
 * - 익명 호출 제한: IP당 분당 20회 / 하루 200회 → 입력 중 자동 검색 없이 Enter/버튼으로만 검색 + 메모리 캐시
 * - 저작자 표시 의무가 없는 CC0 · 퍼블릭 도메인(PDM) 이미지만 검색
 * - 품질 관리가 되는 큐레이션 사진 소스(StockSnap, WordPress 사진 디렉터리)로만 한정
 *   (Flickr 등 전체 검색은 상품 사진·스크린샷 같은 어울리지 않는 결과가 많음)
 *   https://api.openverse.org/v1/
 */

const ENDPOINT = 'https://api.openverse.org/v1/images/';
const PAGE_SIZE = 20;
const cache = new Map();

export class ImageSearchRateLimitError extends Error {}

/**
 * @param {string} query 검색어 (영어일수록 결과가 많음)
 * @param {{ page?: number, aspect?: 'wide' | 'square' | 'tall', signal?: AbortSignal }} options
 * @returns {Promise<{ results: Array<{ id, thumb, url, title, creator, source, width, height }>, hasMore: boolean }>}
 */
export async function searchImages(query, { page = 1, aspect, signal } = {}) {
  const q = query.trim();
  if (!q) return { results: [], hasMore: false };

  const key = `${q.toLowerCase()}|${page}|${aspect || ''}`;
  if (cache.has(key)) return cache.get(key);

  const params = new URLSearchParams({
    q,
    page: String(page),
    page_size: String(PAGE_SIZE),
    license: 'cc0,pdm',
    source: 'stocksnap,wordpress',
    mature: 'false',
  });
  if (aspect) params.set('aspect_ratio', aspect);

  const res = await fetch(`${ENDPOINT}?${params.toString()}`, { signal });
  if (res.status === 429) throw new ImageSearchRateLimitError('rate limited');
  if (!res.ok) throw new Error(`Image search failed: ${res.status}`);
  const data = await res.json();

  const results = (data.results || [])
    .filter((r) => r.url)
    .map((r) => ({
      id: r.id,
      thumb: r.thumbnail || r.url,
      url: r.url,
      title: r.title || '',
      creator: r.creator || '',
      source: r.source || '',
      width: r.width,
      height: r.height,
    }));

  const value = { results, hasMore: page < (data.page_count || 0) };
  cache.set(key, value);
  return value;
}

/** 미리보기용 작은 썸네일 URL (Unsplash 이미지는 폭을 줄여서 요청) */
export function smallThumbFor(url) {
  if (!url) return url;
  if (url.includes('images.unsplash.com')) {
    return url.replace(/([?&])w=\d+/, '$1w=320');
  }
  return url;
}
