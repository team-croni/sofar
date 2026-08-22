import { durationCache, saveDurationCache } from './durationCache';
import { searchItunesMetadata } from './itunes';

export function extractVideoId(url) {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

export function cleanYoutubeMetadata(rawTitle, rawChannel) {
  if (!rawTitle) return { title: 'Unknown Track', artist: rawChannel || 'Unknown Artist' };

  let title = rawTitle;
  let artist = rawChannel || '';

  // 1) 괄호 안 비화제성 키워드 제거
  title = title.replace(/[\(\[\{][^\)\}\]]*(?:official|video|music|mv|m\/v|lyric|audio|hd|4k|live|live ver|remastered|performance|clip|full album|special clip|track|vizualizer|visualizer)[^\)\}\]]*[\)\]\}]/gi, '');

  // 2) 따옴표 안 제목 추출
  const quoteMatch = title.match(/['"“‘]([^'"”’]+)['"”’]/);
  let extractedTitleFromQuote = null;
  if (quoteMatch && quoteMatch[1].trim().length > 0) {
    extractedTitleFromQuote = quoteMatch[1].trim();
  }

  // 3) ' - ' 또는 ' – ' 구분자 분리
  let parts = title.split(/\s+[-–—]\s+/);
  if (parts.length >= 2) {
    artist = parts[0].trim();
    title = parts.slice(1).join(' - ').trim();
  } else if (title.includes(':')) {
    const colonParts = title.split(':');
    if (colonParts[0].trim().length < 25) {
      artist = colonParts[0].trim();
      title = colonParts.slice(1).join(':').trim();
    }
  }

  if (extractedTitleFromQuote && extractedTitleFromQuote.length < title.length) {
    title = extractedTitleFromQuote;
  }

  // 채널명이 Official / Topic 인 경우 클리닝
  artist = artist.replace(/VEVO|Official|Topic|- Topic|\s+Topic/gi, '').trim();

  // 특수문자 잔여물 정돈
  title = title.replace(/^\s*[:\-\[\]\(\)]+|\s*[:\-\[\]\(\)]+$/g, '').trim();
  artist = artist.replace(/^\s*[:\-\[\]\(\)]+|\s*[:\-\[\]\(\)]+$/g, '').trim();

  if (!artist || artist.toLowerCase() === 'youtube' || artist.toLowerCase() === 'music') {
    artist = rawChannel ? rawChannel.replace(/- Topic|Topic|Official/gi, '').trim() : 'Unknown Artist';
  }

  return {
    title: title || rawTitle,
    artist: artist || 'Unknown Artist'
  };
}

export async function extractMetadataWithLocalLLM(rawTitle, rawChannel) {
  // 1순위: iTunes API를 통한 정교한 메타데이터 검색 (0ms ~ 50ms, CORS 호환)
  try {
    const cleaned = cleanYoutubeMetadata(rawTitle, rawChannel);
    const searchQuery = `${cleaned.title} ${cleaned.artist}`.trim();
    const itunesData = await searchItunesMetadata(searchQuery);

    if (itunesData && itunesData.title && itunesData.artist) {
      return {
        title: itunesData.title,
        artist: itunesData.artist,
        artwork: itunesData.artwork,
        durationSec: itunesData.durationSec,
        source: 'itunes'
      };
    }
  } catch (err) {
    console.warn('Failed to extract metadata via iTunes API:', err);
  }

  // 2순위: 정규식 기반 클리너
  return cleanYoutubeMetadata(rawTitle, rawChannel);
}

export function parseIsoDuration(isoDuration) {
  if (!isoDuration) return 0;
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || 0, 10);
  const minutes = parseInt(match[2] || 0, 10);
  const seconds = parseInt(match[3] || 0, 10);
  return hours * 3600 + minutes * 60 + seconds;
}

// 백엔드 API를 통한 비디오 재생길이 조회
export async function fetchVideoDurations(videoIds) {
  if (!videoIds || videoIds.length === 0) return {};
  const uniqueIds = Array.from(new Set(videoIds.filter(Boolean)));
  const idsToFetch = uniqueIds.filter(id => !durationCache.get(id));
  if (idsToFetch.length === 0) return {};

  const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  try {
    const res = await fetch(`${backendUrl}/api/chart/durations?ids=${idsToFetch.join(',')}`);
    if (res.ok) {
      const json = await res.json();
      if (json.success && json.data) {
        Object.entries(json.data).forEach(([id, duration]) => {
          if (duration > 0) {
            durationCache.set(id, duration);
            window.dispatchEvent(new CustomEvent('duration-cached', {
              detail: { videoId: id, duration }
            }));
          }
        });
        saveDurationCache();
        return json.data;
      }
    }
  } catch (e) {
    console.warn('Failed to fetch video durations via backend API', e);
  }
  return {};
}

export function scoreAudioCandidate(rawTitle, rawChannel, targetDurationSec = 0, candidateDurationSec = 0, searchQuery = '') {
  const title = (rawTitle || '').toLowerCase();
  const channel = (rawChannel || '').toLowerCase();
  const cleanSearchQuery = (searchQuery || '').toLowerCase();

  let score = 0;

  // 0) 검색 쿼리(곡명/아티스트) 키워드 토큰 매칭 점수 산출
  if (cleanSearchQuery) {
    const stopWords = new Set(['official', 'audio', 'mv', 'm/v', 'topic', 'feat', 'ft', 'prod', 'lyrics', '가사', '음원', 'music', 'video']);
    const queryTokens = cleanSearchQuery
      .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
      .replace(/[\-_/\\#,.\+~]/g, ' ')
      .split(/\s+/)
      .map(t => t.trim())
      .filter(t => t.length >= 1 && !stopWords.has(t));

    if (queryTokens.length > 0) {
      const normalizedTitle = title.replace(/[\-_/\\#,.\+~]/g, ' ');
      const normalizedChannel = channel.replace(/[\-_/\\#,.\+~]/g, ' ');

      let matchedTitleTokens = 0;
      let matchedChannelTokens = 0;

      queryTokens.forEach(token => {
        if (normalizedTitle.includes(token)) {
          matchedTitleTokens++;
        }
        if (normalizedChannel.includes(token)) {
          matchedChannelTokens++;
        }
      });

      const titleMatchRatio = matchedTitleTokens / queryTokens.length;

      if (titleMatchRatio >= 0.8) {
        score += 4500; // 검색어 대부분이 제목에 포함됨 (최우선)
      } else if (titleMatchRatio >= 0.5) {
        score += 2500;
      } else if (matchedTitleTokens > 0) {
        score += matchedTitleTokens * 1000;
      } else {
        // 검색어의 어떤 핵심 단어도 제목에 포함되지 않은 경우 대폭 감점 (같은 가수의 다른 곡 Topic 1위 가로채기 방지)
        score -= 5000;
      }

      if (matchedChannelTokens > 0) {
        score += matchedChannelTokens * 800;
      }
    }
  }

  // 1) Topic 및 Official Audio 원곡 음원 가산점 강화
  if (channel.endsWith('- topic') || channel.endsWith(' topic') || channel === 'topic') {
    score += 2500; // Official YouTube Music Topic 채널 (원곡 음원 1순위 보장)
  }
  if (title.includes('official audio') || title.includes('audio') || title.includes('음원')) {
    score += 1200;
  }
  if (title.includes('official mv') || title.includes('official video') || title.includes('m/v')) {
    score += 500;
  }

  // 2) 재생길이(Duration) Delta 검증 알고리즘 (±3초 오차 검증)
  if (targetDurationSec > 0 && candidateDurationSec > 0) {
    const delta = Math.abs(targetDurationSec - candidateDurationSec);
    if (delta <= 3) {
      score += 1500; // 거의 일치하는 오피셜 음원
    } else if (delta <= 7) {
      score += 800;  // MV 전주/후주 포함 오피셜 음원
    } else if (delta <= 15) {
      score += 300;
    } else if (delta > 45) {
      score -= 1500; // 라이브 풀버전 / 풀앨범 / 1시간 교차편집 등의 가능성 높음
    }
  }

  // 3) 방송/프로그램/라이브/커버/기타 버전 비선호 키워드 감점 (대폭 감점하여 원곡 매칭 보장)
  const penaltyKeywords = [
    // 방송 / 예능 / 킬링보이스 / 웹콘텐츠
    '비긴어게인', '비긴어게임', 'beginagain', 'begin again',
    '킬링보이스', 'killingvoice', 'killing voice', '딩고', 'dingo',
    '복면가왕', '스케치북', 'sketchbook', '슈가맨', 'sugarman',
    '불후의명곡', '불후의 명곡', '싱어게인', 'singagain', '쇼미더머니', 'smtm',
    '슈퍼스타k', '슈스케', '리무진서비스', '더시즌즈', 'the seasons', '오날오밤', '아티스트', '드라이브',
    '미스터트롯', '미스트롯', '사랑의 콜센타', '뽕숭아학당', '국가가 부른다', '바람의 언덕',
    // 라이브 / 무대 / 행사 / 버스킹
    'stage', 'live', '무대', '직캠', 'fancam', 'stagemix', '스테이지믹스', '교차편집', '교차 편집',
    '라이브', 'concert', '콘서트', '페스티벌', 'festival', 'busking', '버스킹',
    // 다른 버전 / 커버 / 연주 / 노래방 / 자막 / 쇼츠
    'teaser', '티저', 'cover', '커버', 'shorts', '방송', '엠카', '뮤직뱅크', '음악중심', '인기가요',
    'remix', '리믹스', 'acoustic', '어쿠스틱', 'karaoke', '노래방', 'mr', 'inst', 'instrumental',
    '반주', 'piano', '피아노', 'guitar', '기타', 'reaction', '리액션', 'challenge', '챌린지',
    'dance practice', '안무영상', '안무 연습', 'cheering', '응원법', '1시간', '1hour', 'loop', '연속재생'
  ];

  const hasPenaltyKeyword = penaltyKeywords.some(keyword => title.includes(keyword) || channel.includes(keyword));
  if (hasPenaltyKeyword) {
    score -= 2500;
  }

  return score;
}

// 백엔드 API를 통한 키리스 YouTube 검색 (API Key 불필요 및 안전하게 백엔드 처리)
export async function searchYoutube(query, targetDurationSec = 0, excludeVideoIds = []) {
  if (!query || !query.trim()) return [];

  const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);
    const durationParam = targetDurationSec > 0 ? `&duration=${targetDurationSec}` : '';
    const excludeParam = excludeVideoIds && excludeVideoIds.length > 0 ? `&exclude=${excludeVideoIds.join(',')}` : '';
    const backendRes = await fetch(`${backendUrl}/api/chart/search-youtube?q=${encodeURIComponent(query)}${durationParam}${excludeParam}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (backendRes.ok) {
      const backendJson = await backendRes.json();
      if (backendJson.success && Array.isArray(backendJson.data) && backendJson.data.length > 0) {
        return backendJson.data;
      }
    }
  } catch (err) {
    console.warn('Backend YouTube search error:', err);
  }

  return [];
}

export async function getYoutubeVideoMetadata(videoId) {
  if (!videoId) return null;
  const durations = await fetchVideoDurations([videoId]);
  const duration = durations[videoId] || durationCache.get(videoId) || 0;

  return {
    title: 'YouTube Track',
    channelTitle: 'YouTube Channel',
    duration
  };
}
