import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { ChartService } from '../chart/chart.service';

export interface PinnedKeywordItem {
  keyword: string;
  rank?: number;
  pinnedAt: number;
}

export interface BlacklistedKeywordItem {
  keyword: string;
  reason?: string;
  addedAt: number;
}

export interface TrendingKeywordItem {
  rank: number;
  keyword: string;
  count: number;
  status: 'up' | 'down' | 'same' | 'new';
  diff: number;
  isPinned?: boolean;
}

export interface TrendingArtistItem {
  rank: number;
  name: string;
  count: number;
  status: 'up' | 'down' | 'same' | 'new';
  diff: number;
  thumbnail?: string;
  genre?: string;
  trackCount?: number;
}

export interface SearchLogEntry {
  keyword: string;
  timestamp: number;
  clientId?: string;
  artistNames?: string[];
  counted?: boolean;
  filterReason?: string;
}

export interface KeywordStats {
  [keyword: string]: {
    totalCount: number;
    recentCounts: number[];
    lastSearchedAt: number;
  };
}

export interface ArtistStats {
  [artistName: string]: {
    totalCount: number;
    recentCounts: number[];
    lastSearchedAt: number;
    thumbnail?: string;
    genre?: string;
  };
}


export interface SearchLogArtistDto {
  name: string;
  thumbnail?: string;
  genre?: string;
}

@Injectable()
export class SearchService implements OnModuleInit {
  private readonly logger = new Logger(SearchService.name);

  private readonly dataDir = path.join(process.cwd(), 'data');
  private readonly keywordsFilePath = path.join(this.dataDir, 'search_keywords.json');

  // 인메모리 검색 로그 및 통계
  private searchLogs: SearchLogEntry[] = [];
  private keywordStats: KeywordStats = {};
  private artistStats: ArtistStats = {};
  private pinnedKeywords: PinnedKeywordItem[] = [];
  private blacklistedKeywords: BlacklistedKeywordItem[] = [];

  private previousRankings: Map<string, number> = new Map();
  private previousArtistRankings: Map<string, number> = new Map();

  private lastRankingCalculatedAt = 0;
  private cachedTrendingKeywords: TrendingKeywordItem[] = [];
  private cachedTrendingArtists: TrendingArtistItem[] = [];

  private readonly RANKING_CACHE_TTL_MS = 60 * 1000; // 1분

  // ── 어뷰징(순위 조작) 방지 정책 상수 ──
  private readonly SAME_USER_COOLDOWN_MS = 10 * 60 * 1000; // 10분: 동일 사용자의 동일 키워드 재검색 쿨다운
  private readonly DAILY_MAX_COUNT_PER_USER = 3; // 24시간 내 동일 사용자-키워드 최대 3회 점수 반영

  constructor(private readonly chartService: ChartService) {}

  async onModuleInit() {
    this.ensureDataDir();
    this.loadKeywordsFromFile();
    await this.calculateTrendingKeywords();
    await this.calculateTrendingArtists();
  }

  private ensureDataDir() {
    if (!fs.existsSync(this.dataDir)) {
      try {
        fs.mkdirSync(this.dataDir, { recursive: true });
      } catch (err) {
        this.logger.error('Failed to create data directory:', err);
      }
    }
  }

  private loadKeywordsFromFile() {
    if (fs.existsSync(this.keywordsFilePath)) {
      try {
        const raw = fs.readFileSync(this.keywordsFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        this.keywordStats = parsed.keywordStats || {};
        this.artistStats = parsed.artistStats || {};
        this.pinnedKeywords = Array.isArray(parsed.pinnedKeywords) ? parsed.pinnedKeywords : [];
        this.blacklistedKeywords = Array.isArray(parsed.blacklistedKeywords) ? parsed.blacklistedKeywords : [];
        this.searchLogs = (parsed.recentLogs || []).slice(-1000);
        this.logger.log(
          `Loaded ${Object.keys(this.keywordStats).length} keywords, ${Object.keys(this.artistStats).length} artists, ${this.pinnedKeywords.length} pinned, ${this.blacklistedKeywords.length} blacklisted from file.`,
        );
      } catch (err) {
        this.logger.warn('Failed to parse search_keywords.json:', err);
      }
    }
  }

  private saveKeywordsToFile() {
    try {
      this.ensureDataDir();
      const payload = {
        updatedAt: new Date().toISOString(),
        keywordStats: this.keywordStats,
        artistStats: this.artistStats,
        pinnedKeywords: this.pinnedKeywords,
        blacklistedKeywords: this.blacklistedKeywords,
        recentLogs: this.searchLogs.slice(-500),
      };
      fs.writeFileSync(this.keywordsFilePath, JSON.stringify(payload, null, 2), 'utf-8');
    } catch (err) {
      this.logger.error('Failed to save search_keywords.json:', err);
    }
  }

  /**
   * 사용자 실제 검색어 및 아티스트 로깅 및 집계 (어뷰징/순위 조작 방지 필터링 적용)
   */
  async logSearchKeyword(
    rawKeyword: string,
    clientId?: string,
    artists?: SearchLogArtistDto[],
    userId?: string,
    isGuest?: boolean,
  ): Promise<{ success: boolean; isCounted?: boolean; filterReason?: string }> {
    if (!rawKeyword) return { success: false };

    const keyword = rawKeyword.trim();
    if (keyword.length < 2 || keyword.length > 50) {
      return { success: false };
    }

    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    // ── 1. 초단기 중복 로깅 방지 (5초 이내 동일 클라이언트 + 동일 검색어는 로그 기록 자체를 무시) ──
    if (clientId) {
      const isInstantDuplicate = this.searchLogs.some(
        (log) =>
          log.clientId === clientId &&
          log.keyword.toLowerCase().trim() === keyword.toLowerCase().trim() &&
          now - log.timestamp < 5000,
      );
      if (isInstantDuplicate) {
        return { success: true, isCounted: false, filterReason: '5초 이내 중복 요청 무시' };
      }
    }

    // ── 2. 어뷰징 방지 검증 로직 ──
    let isCounted = true;
    let filterReason: string | undefined = undefined;

    // 게스트(비로그인) 검색어인 경우: 로그만 기록하고 랭킹 점수 집계에서 완전 제외
    if (isGuest || !userId) {
      isCounted = false;
      filterReason = '게스트(비로그인) 검색 제한';
    }

    if (isCounted && clientId) {
      // 동일 사용자 최근 10분 쿨다운 확인
      const recentValidLog = this.searchLogs.find(
        (log) =>
          log.clientId === clientId &&
          log.keyword.toLowerCase().trim() === keyword.toLowerCase().trim() &&
          log.counted !== false &&
          now - log.timestamp < this.SAME_USER_COOLDOWN_MS,
      );

      if (recentValidLog) {
        isCounted = false;
        filterReason = '동일 사용자 10분 쿨다운 제한';
      }

      // 동일 사용자 24시간 내 최대 반영 횟수(3회) 확인
      if (isCounted) {
        const past24hValidCount = this.searchLogs.filter(
          (log) =>
            log.clientId === clientId &&
            log.keyword.toLowerCase().trim() === keyword.toLowerCase().trim() &&
            log.counted !== false &&
            log.timestamp >= oneDayAgo,
        ).length;

        if (past24hValidCount >= this.DAILY_MAX_COUNT_PER_USER) {
          isCounted = false;
          filterReason = `동일 키워드 일일 최대 점수 반영(${this.DAILY_MAX_COUNT_PER_USER}회) 초과`;
        }
      }
    }

    const artistNames = (artists || [])
      .map((a) => (a.name || '').trim())
      .filter((name) => name.length >= 2 && name !== 'Unknown Artist');

    // 1. 로그 추가 (어뷰징으로 제외되더라도 사용자 검색 히스토리는 정상 기록)
    this.searchLogs.push({
      keyword,
      timestamp: now,
      clientId,
      artistNames: artistNames.length > 0 ? artistNames : undefined,
      counted: isCounted,
      filterReason,
    });

    if (this.searchLogs.length > 3000) {
      this.searchLogs = this.searchLogs.slice(-2000);
    }

    // 2. 유효한 검색인 경우에만 키워드 통계 및 랭킹 점수 갱신
    if (isCounted) {
      if (!this.keywordStats[keyword]) {
        this.keywordStats[keyword] = {
          totalCount: 1,
          recentCounts: [1],
          lastSearchedAt: now,
        };
      } else {
        this.keywordStats[keyword].totalCount += 1;
        this.keywordStats[keyword].lastSearchedAt = now;
        if (!this.keywordStats[keyword].recentCounts) {
          this.keywordStats[keyword].recentCounts = [1];
        } else {
          const lastIdx = this.keywordStats[keyword].recentCounts.length - 1;
          this.keywordStats[keyword].recentCounts[lastIdx] =
            (this.keywordStats[keyword].recentCounts[lastIdx] || 0) + 1;
        }
      }

      // 3. 아티스트 통계 갱신
      if (artists && artists.length > 0) {
        artists.slice(0, 3).forEach((art, idx) => {
          const name = (art.name || '').trim();
          if (!name || name.length < 2 || name === 'Unknown Artist') return;

          const weight = idx === 0 ? 1 : 0.5;
          if (!this.artistStats[name]) {
            this.artistStats[name] = {
              totalCount: weight,
              recentCounts: [weight],
              lastSearchedAt: now,
              thumbnail: art.thumbnail || undefined,
              genre: art.genre || undefined,
            };
          } else {
            this.artistStats[name].totalCount += weight;
            this.artistStats[name].lastSearchedAt = now;
            if (art.thumbnail && !this.artistStats[name].thumbnail) {
              this.artistStats[name].thumbnail = art.thumbnail;
            }
            if (art.genre && !this.artistStats[name].genre) {
              this.artistStats[name].genre = art.genre;
            }
            if (!this.artistStats[name].recentCounts) {
              this.artistStats[name].recentCounts = [weight];
            } else {
              const lastIdx = this.artistStats[name].recentCounts.length - 1;
              this.artistStats[name].recentCounts[lastIdx] =
                (this.artistStats[name].recentCounts[lastIdx] || 0) + weight;
            }
          }
        });
      }

      this.lastRankingCalculatedAt = 0;
    }

    // 파일 저장
    if (this.searchLogs.length % 5 === 0) {
      this.saveKeywordsToFile();
    }

    return { success: true, isCounted, filterReason };
  }

  /**
   * 실시간 인기 검색어 Top 10 산출 (실제 사용자 검색 로그 + 서버 실시간 차트 기반)
   */
  async getTrendingKeywords(limit = 10): Promise<TrendingKeywordItem[]> {
    const now = Date.now();

    if (this.cachedTrendingKeywords.length > 0 && now - this.lastRankingCalculatedAt < this.RANKING_CACHE_TTL_MS) {
      return this.cachedTrendingKeywords.slice(0, limit);
    }

    await this.calculateTrendingKeywords();
    return this.cachedTrendingKeywords.slice(0, limit);
  }

  /**
   * 실시간 인기 아티스트 Top 10 산출 (실제 검색 로그 집계 + 실시간 음원 차트 가중치)
   */
  async getTrendingArtists(limit = 10): Promise<TrendingArtistItem[]> {
    const now = Date.now();

    if (this.cachedTrendingArtists.length > 0 && now - this.lastRankingCalculatedAt < this.RANKING_CACHE_TTL_MS) {
      return this.cachedTrendingArtists.slice(0, limit);
    }

    await this.calculateTrendingArtists();
    return this.cachedTrendingArtists.slice(0, limit);
  }

  private async calculateTrendingKeywords() {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    // 1. 최근 24시간 동안의 유효 검색 로그에서 고유 사용자(Unique Users) 및 유효 횟수 집계
    const uniqueUserMap = new Map<string, Set<string>>();
    const validCountMap = new Map<string, number>();

    for (const log of this.searchLogs) {
      if (log.timestamp >= oneDayAgo && log.counted !== false) {
        const kw = log.keyword;
        validCountMap.set(kw, (validCountMap.get(kw) || 0) + 1);

        if (!uniqueUserMap.has(kw)) {
          uniqueUserMap.set(kw, new Set());
        }
        if (log.clientId) {
          uniqueUserMap.get(kw)!.add(log.clientId);
        }
      }
    }

    // 2. 공정 점수 산출: (고유 사용자 수 * 25점) + (유효 검색 수 * 2점) + (누적 수치 * 최신성 가중치)
    const scoredMap = new Map<string, number>();

    for (const [kw, stat] of Object.entries(this.keywordStats)) {
      const uniqueUsers = uniqueUserMap.get(kw)?.size || (validCountMap.get(kw) ? 1 : 0);
      const validCounts = validCountMap.get(kw) || 0;
      const recencyBoost = Math.max(0, 1 - (now - stat.lastSearchedAt) / (7 * 24 * 60 * 60 * 1000));

      const naturalScore = uniqueUsers * 25 + validCounts * 2;
      const baseCount = stat.totalCount || 0;
      // 관리자 직접 부여 점수(totalCount) 우선 반영 및 자연 검색량 가산
      const score = Math.max(baseCount, naturalScore + baseCount * 0.2 * recencyBoost);
      if (score > 0) {
        scoredMap.set(kw, Math.round(score));
      }
    }

    // 3. 만약 초기 상태라 검색 로그가 10개 미만일 경우, 실제 서버 실시간 차트 데이터(Bugs/LastFM)에서 실제 음원/아티스트를 동적으로 채움
    if (scoredMap.size < 10 && this.chartService) {
      try {
        const liveChartTracks = await this.chartService.getTopCharts(20);
        if (liveChartTracks && liveChartTracks.length > 0) {
          for (let i = 0; i < liveChartTracks.length && scoredMap.size < 15; i++) {
            const t = liveChartTracks[i];
            const artist = (t.custom_artist || '').trim();
            const title = (t.custom_title || '').trim();

            if (artist && !scoredMap.has(artist)) {
              scoredMap.set(artist, Math.max(1, 20 - i));
            }
            if (title && !scoredMap.has(title)) {
              scoredMap.set(title, Math.max(1, 15 - i));
            }
          }
        }
      } catch (err) {
        this.logger.warn('Failed to get live chart tracks for trending fallback:', err);
      }
    }

    const scoredList: { keyword: string; score: number }[] = [];
    scoredMap.forEach((score, keyword) => {
      scoredList.push({ keyword, score });
    });

    // 4. 점수 기준 내림차순 정렬
    scoredList.sort((a, b) => b.score - a.score);

    // 5. 블랙리스트 키워드 필터링
    const blacklistedSet = new Set(this.blacklistedKeywords.map((k) => k.keyword.toLowerCase().trim()));
    const filteredList = scoredList.filter((item) => !blacklistedSet.has(item.keyword.toLowerCase().trim()));

    // 6. 고정(Pinned) 키워드 병합 및 최우선 순위 처리
    const pinnedSet = new Set(this.pinnedKeywords.map((k) => k.keyword.toLowerCase().trim()));
    const pinnedList: { keyword: string; score: number; isPinned: boolean; forcedRank?: number }[] = [];

    this.pinnedKeywords.forEach((pinned) => {
      if (!blacklistedSet.has(pinned.keyword.toLowerCase().trim())) {
        const existingScore = scoredMap.get(pinned.keyword) || 999;
        pinnedList.push({
          keyword: pinned.keyword,
          score: existingScore,
          isPinned: true,
          forcedRank: pinned.rank,
        });
      }
    });

    // 고정 키워드들끼리도 점수(Score) 내림차순으로 정렬하여 높은 점수가 1순위(1위, 2위...)를 차지하도록 정렬
    pinnedList.sort((a, b) => b.score - a.score);

    // 고정 키워드와 일반 키워드 합치기 (중복 제거)
    const combinedList: { keyword: string; score: number; isPinned: boolean }[] = [...pinnedList];
    filteredList.forEach((item) => {
      if (!pinnedSet.has(item.keyword.toLowerCase().trim())) {
        combinedList.push({
          keyword: item.keyword,
          score: item.score,
          isPinned: false,
        });
      }
    });

    const topKeywords = combinedList.slice(0, 15);
    const result: TrendingKeywordItem[] = [];

    topKeywords.forEach((item, index) => {
      const currentRank = index + 1;
      const prevRank = this.previousRankings.get(item.keyword);

      let status: 'up' | 'down' | 'same' | 'new' = 'same';
      let diff = 0;

      if (prevRank === undefined) {
        status = 'new';
        diff = 0;
      } else if (prevRank > currentRank) {
        status = 'up';
        diff = prevRank - currentRank;
      } else if (prevRank < currentRank) {
        status = 'down';
        diff = currentRank - prevRank;
      } else {
        status = 'same';
        diff = 0;
      }

      result.push({
        rank: currentRank,
        keyword: item.keyword,
        count: Math.round(item.score),
        status,
        diff,
        isPinned: item.isPinned,
      });
    });

    const newPrevMap = new Map<string, number>();
    result.forEach((item) => newPrevMap.set(item.keyword, item.rank));
    this.previousRankings = newPrevMap;

    this.cachedTrendingKeywords = result;
    this.lastRankingCalculatedAt = now;
  }

  private async calculateTrendingArtists() {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    // 1. 최근 24시간 동안의 검색 로그 내 유효 아티스트 및 고유 사용자 집계
    const uniqueUserArtistMap = new Map<string, Set<string>>();
    const validArtistCounts = new Map<string, number>();

    for (const log of this.searchLogs) {
      if (log.timestamp >= oneDayAgo && log.counted !== false) {
        const names = log.artistNames || [];
        for (const name of names) {
          validArtistCounts.set(name, (validArtistCounts.get(name) || 0) + 1);
          if (!uniqueUserArtistMap.has(name)) {
            uniqueUserArtistMap.set(name, new Set());
          }
          if (log.clientId) {
            uniqueUserArtistMap.get(name)!.add(log.clientId);
          }
        }
      }
    }

    // 2. 아티스트 점수 및 메타데이터 맵 구축 (고유 사용자 * 25점 + 유효검색 * 2점)
    const scoredMap = new Map<
      string,
      {
        score: number;
        thumbnail?: string;
        genre?: string;
      }
    >();

    for (const [artName, stat] of Object.entries(this.artistStats)) {
      const uniqueUsers = uniqueUserArtistMap.get(artName)?.size || (validArtistCounts.get(artName) ? 1 : 0);
      const recentCount = validArtistCounts.get(artName) || 0;
      const recencyBoost = Math.max(0, 1 - (now - stat.lastSearchedAt) / (7 * 24 * 60 * 60 * 1000));

      const score = uniqueUsers * 25 + recentCount * 2 + stat.totalCount * 0.3 * recencyBoost;
      if (score > 0) {
        scoredMap.set(artName, {
          score,
          thumbnail: stat.thumbnail,
          genre: stat.genre,
        });
      }
    }

    // 3. 차트 서비스의 실시간 음원 데이터를 통해 아티스트 및 썸네일 보강
    if (this.chartService) {
      try {
        const liveChartTracks = await this.chartService.getTopCharts(30);
        if (liveChartTracks && liveChartTracks.length > 0) {
          liveChartTracks.forEach((t, i) => {
            const rawArtist = (t.custom_artist || '').trim();
            if (!rawArtist || rawArtist === 'Unknown Artist') return;

            // 괄호 및 피처링 정리
            let cleanArtist = rawArtist;
            if (cleanArtist.includes('(')) {
              const main = cleanArtist.split('(')[0].trim();
              if (main.length >= 2) cleanArtist = main;
            }

            const chartBonus = Math.max(1, 30 - i) * 1.5;
            const existing = scoredMap.get(cleanArtist);

            if (existing) {
              existing.score += chartBonus;
              if (!existing.thumbnail && t.artwork) {
                existing.thumbnail = t.artwork;
              }
              if (!existing.genre && t.genre) {
                existing.genre = t.genre;
              }
            } else {
              scoredMap.set(cleanArtist, {
                score: chartBonus,
                thumbnail: t.artwork || undefined,
                genre: t.genre || undefined,
              });
            }
          });
        }
      } catch (err) {
        this.logger.warn('Failed to incorporate chart tracks into trending artists:', err);
      }
    }

    const blacklistedSet = new Set(this.blacklistedKeywords.map((k) => k.keyword.toLowerCase().trim()));

    const scoredList: {
      name: string;
      score: number;
      thumbnail?: string;
      genre?: string;
    }[] = [];

    scoredMap.forEach((meta, name) => {
      if (!blacklistedSet.has(name.toLowerCase().trim())) {
        scoredList.push({
          name,
          score: meta.score,
          thumbnail: meta.thumbnail,
          genre: meta.genre,
        });
      }
    });

    // 4. 점수 기준 내림차순 정렬
    scoredList.sort((a, b) => b.score - a.score);

    // 5. 상위 15명 선출 및 순위 변동 계산
    const topArtists = scoredList.slice(0, 15);
    const result: TrendingArtistItem[] = [];

    topArtists.forEach((item, index) => {
      const currentRank = index + 1;
      const prevRank = this.previousArtistRankings.get(item.name);

      let status: 'up' | 'down' | 'same' | 'new' = 'same';
      let diff = 0;

      if (prevRank === undefined) {
        status = 'new';
        diff = 0;
      } else if (prevRank > currentRank) {
        status = 'up';
        diff = prevRank - currentRank;
      } else if (prevRank < currentRank) {
        status = 'down';
        diff = currentRank - prevRank;
      } else {
        status = 'same';
        diff = 0;
      }

      result.push({
        rank: currentRank,
        name: item.name,
        count: Math.round(item.score),
        status,
        diff,
        thumbnail: item.thumbnail,
        genre: item.genre,
      });
    });

    const newPrevMap = new Map<string, number>();
    result.forEach((item) => newPrevMap.set(item.name, item.rank));
    this.previousArtistRankings = newPrevMap;

    this.cachedTrendingArtists = result;
  }

  // ══════════════════════════════════════════════════════════════
  // 관리자 전용 검색어 순위 관리 메소드 (Admin Methods)
  // ══════════════════════════════════════════════════════════════

  /**
   * 관리자용 검색어 순위 전체 데이터 및 요약 통계 조회
   */
  async getSearchRankingAdminData(): Promise<{
    trendingKeywords: TrendingKeywordItem[];
    trendingArtists: TrendingArtistItem[];
    pinnedKeywords: PinnedKeywordItem[];
    blacklistedKeywords: BlacklistedKeywordItem[];
    recentLogs: SearchLogEntry[];
    stats: {
      totalKeywordsCount: number;
      totalArtistsCount: number;
      totalLogsCount: number;
      logsLast24h: number;
      pinnedCount: number;
      blacklistedCount: number;
      topKeyword: string;
    };
  }> {
    const [keywords, artists] = await Promise.all([
      this.getTrendingKeywords(15),
      this.getTrendingArtists(15),
    ]);

    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const logsLast24h = this.searchLogs.filter((l) => l.timestamp >= oneDayAgo).length;

    return {
      trendingKeywords: keywords,
      trendingArtists: artists,
      pinnedKeywords: [...this.pinnedKeywords],
      blacklistedKeywords: [...this.blacklistedKeywords],
      recentLogs: [...this.searchLogs].reverse().slice(0, 100),
      stats: {
        totalKeywordsCount: Object.keys(this.keywordStats).length,
        totalArtistsCount: Object.keys(this.artistStats).length,
        totalLogsCount: this.searchLogs.length,
        logsLast24h,
        pinnedCount: this.pinnedKeywords.length,
        blacklistedCount: this.blacklistedKeywords.length,
        topKeyword: keywords[0]?.keyword || '-',
      },
    };
  }

  /**
   * 키워드 상위 고정(Pin) 등록/수정
   */
  async pinKeyword(keyword: string, rank?: number): Promise<{ success: boolean; data: PinnedKeywordItem[] }> {
    const clean = (keyword || '').trim();
    if (!clean) return { success: false, data: this.pinnedKeywords };

    // 기존 고정 제거 후 새로 추가
    this.pinnedKeywords = this.pinnedKeywords.filter(
      (k) => k.keyword.toLowerCase() !== clean.toLowerCase(),
    );

    this.pinnedKeywords.unshift({
      keyword: clean,
      rank: rank || 1,
      pinnedAt: Date.now(),
    });

    // 블랙리스트에서 제거
    this.blacklistedKeywords = this.blacklistedKeywords.filter(
      (k) => k.keyword.toLowerCase() !== clean.toLowerCase(),
    );

    this.saveKeywordsToFile();
    await this.recalculateTrending(true);

    return { success: true, data: this.pinnedKeywords };
  }

  /**
   * 키워드 고정 해제(Unpin)
   */
  async unpinKeyword(keyword: string): Promise<{ success: boolean; data: PinnedKeywordItem[] }> {
    const clean = (keyword || '').trim();
    this.pinnedKeywords = this.pinnedKeywords.filter(
      (k) => k.keyword.toLowerCase() !== clean.toLowerCase(),
    );

    this.saveKeywordsToFile();
    await this.recalculateTrending(true);

    return { success: true, data: this.pinnedKeywords };
  }

  /**
   * 금지어(블랙리스트) 추가
   */
  async addBlacklistKeyword(keyword: string, reason?: string): Promise<{ success: boolean; data: BlacklistedKeywordItem[] }> {
    const clean = (keyword || '').trim();
    if (!clean) return { success: false, data: this.blacklistedKeywords };

    // 고정 목록에서 제거
    this.pinnedKeywords = this.pinnedKeywords.filter(
      (k) => k.keyword.toLowerCase() !== clean.toLowerCase(),
    );

    // 기존 블랙리스트에서 중복 제거 후 추가
    this.blacklistedKeywords = this.blacklistedKeywords.filter(
      (k) => k.keyword.toLowerCase() !== clean.toLowerCase(),
    );

    this.blacklistedKeywords.unshift({
      keyword: clean,
      reason: reason || '관리자 차단',
      addedAt: Date.now(),
    });

    this.saveKeywordsToFile();
    await this.recalculateTrending(true);

    return { success: true, data: this.blacklistedKeywords };
  }

  /**
   * 금지어(블랙리스트) 삭제/해제
   */
  async removeBlacklistKeyword(keyword: string): Promise<{ success: boolean; data: BlacklistedKeywordItem[] }> {
    const clean = (keyword || '').trim();
    this.blacklistedKeywords = this.blacklistedKeywords.filter(
      (k) => k.keyword.toLowerCase() !== clean.toLowerCase(),
    );

    this.saveKeywordsToFile();
    await this.recalculateTrending(true);

    return { success: true, data: this.blacklistedKeywords };
  }

  /**
   * 수동 검색어 등록 또는 검색수/가중치 수정
   */
  async addOrUpdateKeyword(
    keyword: string,
    count: number,
  ): Promise<{ success: boolean; keyword: string; count: number }> {
    const clean = (keyword || '').trim();
    if (!clean) return { success: false, keyword: '', count: 0 };

    const targetCount = Math.max(1, count || 1);
    const now = Date.now();

    if (!this.keywordStats[clean]) {
      this.keywordStats[clean] = {
        totalCount: targetCount,
        recentCounts: [targetCount],
        lastSearchedAt: now,
      };
    } else {
      this.keywordStats[clean].totalCount = targetCount;
      this.keywordStats[clean].lastSearchedAt = now;
      this.keywordStats[clean].recentCounts = [targetCount];
    }

    // 블랙리스트에서 제거
    this.blacklistedKeywords = this.blacklistedKeywords.filter(
      (k) => k.keyword.toLowerCase() !== clean.toLowerCase(),
    );

    this.saveKeywordsToFile();
    await this.recalculateTrending(true);

    return { success: true, keyword: clean, count: targetCount };
  }

  /**
   * 검색어 및 관련 통계 완전 삭제
   */
  async deleteKeyword(keyword: string): Promise<{ success: boolean }> {
    const clean = (keyword || '').trim();
    if (!clean) return { success: false };

    delete this.keywordStats[clean];
    delete this.artistStats[clean];

    this.pinnedKeywords = this.pinnedKeywords.filter(
      (k) => k.keyword.toLowerCase() !== clean.toLowerCase(),
    );
    this.blacklistedKeywords = this.blacklistedKeywords.filter(
      (k) => k.keyword.toLowerCase() !== clean.toLowerCase(),
    );
    this.searchLogs = this.searchLogs.filter(
      (l) => l.keyword.toLowerCase() !== clean.toLowerCase(),
    );

    this.saveKeywordsToFile();
    await this.recalculateTrending(true);

    return { success: true };
  }

  /**
   * 검색 로그 전체 초기화
   */
  async clearSearchLogs(): Promise<{ success: boolean }> {
    this.searchLogs = [];
    this.saveKeywordsToFile();
    await this.recalculateTrending(true);
    return { success: true };
  }

  /**
   * 실시간 순위 캐시 무효화 및 강제 재계산
   */
  async recalculateTrending(force = true): Promise<{ success: boolean }> {
    if (force) {
      this.lastRankingCalculatedAt = 0;
    }
    await Promise.all([
      this.calculateTrendingKeywords(),
      this.calculateTrendingArtists(),
    ]);
    return { success: true };
  }
}

