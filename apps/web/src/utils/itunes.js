/**
 * Apple iTunes Search API를 활용한 메타데이터 및 실제 음원 목록 검색 유틸리티
 */

export async function searchItunesMetadata(query) {
  if (!query || !query.trim()) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=5`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    if (res.ok) {
      const json = await res.json();
      if (json.results && json.results.length > 0) {
        const item = json.results[0];
        const durationSec = item.trackTimeMillis ? Math.round(item.trackTimeMillis / 1000) : 0;
        const rawArtwork = item.artworkUrl100 || '';
        const artwork = rawArtwork ? rawArtwork.replace('100x100bb', '1000x1000bb') : null;

        return {
          title: item.trackName || '',
          artist: item.artistName || '',
          album: item.collectionName || '',
          genre: item.primaryGenreName || '',
          artwork,
          durationSec,
          source: 'itunes'
        };
      }
    }
  } catch (err) {
    console.warn('iTunes API search error:', err);
  }

  return null;
}

/**
 * 국내 음원 DB 검색 (Bugs 크롤링 기반 백엔드 API 연동)
 * 100% 한국어 원본 곡명, 한국어 아티스트명, 앨범명, 500x500 고화질 앨범아트 반환
 */
export async function searchDomesticTracks(query, limit = 20) {
  if (!query || !query.trim()) return [];

  const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(
      `${backendUrl}/api/chart/search-domestic?q=${encodeURIComponent(query)}&limit=${limit}`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        return json.data.map((item, idx) => ({
          id: item.id || `domestic-${idx}-${Date.now()}`,
          artist_id: item.artist_id || null,
          custom_title: item.custom_title || '',
          custom_artist: item.custom_artist || '',
          album: item.album || '',
          genre: item.genre || '가요',
          thumbnail: item.thumbnail || '',
          artwork: item.artwork || item.thumbnail || '',
          durationSec: item.durationSec || 0,
          searchQuery: item.searchQuery || `${item.custom_artist} ${item.custom_title}`.trim(),
          youtube_video_id: null,
          source: 'domestic-search'
        }));
      }
    }
  } catch (err) {
    console.warn('Domestic track search error:', err);
  }

  return [];
}

/**
 * 키워드 기반 실제 음원 DB 검색 (iTunes Open API - 한국 스토어 & 한국어 locale)
 * 정제된 실제 곡/음원 리스트 (곡명, 아티스트, 앨범, 600x600 고화질 커버, 원곡 재생길이) 반환
 */
export async function searchItunesTracks(query, limit = 20) {
  if (!query || !query.trim()) return [];

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=${limit}`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    if (res.ok) {
      const json = await res.json();
      if (json.results && json.results.length > 0) {
        return json.results.map((item, idx) => {
          const durationSec = item.trackTimeMillis ? Math.round(item.trackTimeMillis / 1000) : 0;
          const rawArtwork = item.artworkUrl100 || '';
          const artwork = rawArtwork ? rawArtwork.replace('100x100bb', '600x600bb') : null;

          return {
            id: `itunes-${item.trackId || idx}-${Date.now()}`,
            artist_id: item.artistId ? String(item.artistId) : null,
            custom_title: item.trackName || '',
            custom_artist: item.artistName || '',
            album: item.collectionName || '',
            genre: item.primaryGenreName || '',
            thumbnail: artwork,
            durationSec,
            searchQuery: `${item.artistName || ''} ${item.trackName || ''}`.trim(),
            youtube_video_id: null, // 재생 또는 백그라운드 시 YouTube 자동 매칭
            source: 'itunes-search'
          };
        });
      }
    }
  } catch (err) {
    console.warn('iTunes API track list search error:', err);
  }

  return [];
}
