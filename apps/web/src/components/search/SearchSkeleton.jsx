import React from 'react';

export default function SearchSkeleton() {
  return (
    <div className="search-skeleton-container search-results-content-wrap">
      {/* 1. 아티스트 섹션 스켈레톤 */}
      <div className="artists-results-section">
        <div className="section-header">
          <div className="skeleton-title-shimmer skeleton-pulse" style={{ width: '100px', height: '22px' }} />
        </div>
        <div className="search-artists-grid">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="search-artist-profile-card skeleton-artist-card">
              <div className="skeleton-artist-avatar skeleton-pulse" />
              <div className="skeleton-artist-info">
                <div className="skeleton-line skeleton-pulse" style={{ width: '65%', height: '14px' }} />
                <div className="skeleton-line skeleton-pulse" style={{ width: '40%', height: '11px' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2. 추천 검색 트랙 목록 스켈레톤 */}
      <div className="tracks-list-section home-section--popular">
        <div className="section-header">
          <div className="skeleton-title-shimmer skeleton-pulse" style={{ width: '130px', height: '22px' }} />
          <div className="skeleton-header-actions">
            <div className="skeleton-action-btn skeleton-pulse" />
            <div className="skeleton-action-btn skeleton-pulse" />
            <div className="skeleton-action-btn skeleton-pulse" />
          </div>
        </div>
        <div className="popular-list">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="popular-row search-popular-row skeleton-track-row">
              <span className="popular-row__col-rank">
                <span className="skeleton-rank-box skeleton-pulse" />
              </span>
              <div className="popular-row__title-group">
                <div className="skeleton-thumb skeleton-pulse" />
                <div className="skeleton-track-title-box skeleton-pulse" />
              </div>
              <span className="popular-row__artist">
                <span className="skeleton-artist-box skeleton-pulse" />
              </span>
              <span className="popular-row__album search-track-album">
                <span className="skeleton-album-box skeleton-pulse" />
              </span>
              <div className="popular-row__actions">
                <div className="skeleton-action-dot skeleton-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
