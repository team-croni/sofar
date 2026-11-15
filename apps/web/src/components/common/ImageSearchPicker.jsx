import React, { useEffect, useRef, useState } from 'react';
import { Search, Check, Loader2, LayoutGrid, X } from 'lucide-react';
import { Input } from '../ui';
import { searchImages, smallThumbFor, ImageSearchRateLimitError } from '../../utils/imageSearch';
import './ImageSearchPicker.css';

const MODES = [
  { id: 'preset', label: '추천' },
  { id: 'search', label: '검색' },
  { id: 'url', label: '링크' },
];

/**
 * 이미지 선택 피커 (커버 썸네일 / Now Playing 배경 공용)
 * - 추천: 미리 골라둔 이미지
 * - 검색: Openverse 무료 이미지 검색 (키워드 칩은 한국어 라벨 → 영어 검색어)
 * - 링크: 이미지 주소 직접 입력
 * 그리드는 자체 스크롤 없이 부모(설정 영역) 스크롤을 그대로 사용
 */
export default function ImageSearchPicker({
  value,
  onChange,
  presets = [],
  keywords = [],
  aspect, // 'wide' | 'square'
  emptyLabel = '기본',
  emptyIcon = <LayoutGrid size={16} />,
}) {
  const [mode, setMode] = useState('preset');
  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [results, setResults] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | loading | done | error | limited
  const abortRef = useRef(null);
  const searchInputRef = useRef(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (mode === 'search') searchInputRef.current?.focus();
  }, [mode]);

  const runSearch = async (q, nextPage = 1) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('loading');
    setActiveQuery(trimmed);
    if (nextPage === 1) setResults([]);
    try {
      // 정사각형 비율 필터는 결과가 너무 적어서 가로형(배경)일 때만 비율 필터 적용
      const data = await searchImages(trimmed, {
        page: nextPage,
        aspect: aspect === 'wide' ? 'wide' : undefined,
        signal: controller.signal,
      });
      setResults((prev) => (nextPage === 1 ? data.results : [...prev, ...data.results]));
      setHasMore(data.hasMore);
      setPage(nextPage);
      setStatus('done');
    } catch (err) {
      if (err.name === 'AbortError') return;
      setStatus(err instanceof ImageSearchRateLimitError ? 'limited' : 'error');
    }
  };

  const submitSearch = (e) => {
    e?.preventDefault();
    e?.stopPropagation();
    runSearch(query);
  };

  const handleKeyword = (kw) => {
    setQuery(kw.query);
    runSearch(kw.query);
  };

  const gridClass = `isp-grid ${aspect === 'wide' ? 'is-wide' : 'is-square'}`;

  const renderTile = ({ key, url, thumb, label, title, fallback }) => {
    const selected = value === url;
    return (
      <button
        key={key}
        type="button"
        className={`isp-tile ${selected ? 'selected' : ''}`}
        onClick={() => onChange(url)}
        title={title || label}
        aria-pressed={selected}
      >
        {url ? (
          <img
            src={thumb}
            alt={label || title || ''}
            loading="lazy"
            onError={(e) => {
              if (fallback && e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
            }}
          />
        ) : (
          <span className="isp-tile-empty">
            {emptyIcon}
            {emptyLabel}
          </span>
        )}
        {label && url && <span className="isp-tile-label">{label}</span>}
        {selected && <span className="isp-tile-check"><Check size={12} strokeWidth={2.5} /></span>}
      </button>
    );
  };

  return (
    <div className="isp">
      {/* 추천 / 검색 / 링크 */}
      <div className="isp-modes" role="tablist">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={mode === m.id}
            className={`isp-mode ${mode === m.id ? 'active' : ''}`}
            onClick={() => setMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'preset' && (
        <div className={gridClass}>
          {presets.map((preset) =>
            renderTile({
              key: preset.label,
              url: preset.url,
              thumb: smallThumbFor(preset.url),
              label: preset.label,
            })
          )}
        </div>
      )}

      {mode === 'search' && (
        <>
          <div className="isp-search">
            <Search size={15} className="isp-search-icon" />
            <input
              ref={searchInputRef}
              className="isp-search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitSearch(e);
              }}
              placeholder="영어로 검색하면 더 많은 결과를 볼 수 있습니다 (예: night city)"
            />
            {query && (
              <button
                type="button"
                className="isp-search-clear"
                onClick={() => {
                  setQuery('');
                  searchInputRef.current?.focus();
                }}
                aria-label="검색어 지우기"
              >
                <X size={14} />
              </button>
            )}
            <button type="button" className="isp-search-btn" onClick={submitSearch} disabled={!query.trim()}>
              검색
            </button>
          </div>

          {keywords.length > 0 && (
            <div className="isp-keywords">
              {keywords.map((kw) => (
                <button
                  key={kw.label}
                  type="button"
                  className={`isp-keyword ${activeQuery === kw.query ? 'active' : ''}`}
                  onClick={() => handleKeyword(kw)}
                >
                  {kw.label}
                </button>
              ))}
            </div>
          )}

          {results.length > 0 && (
            <div className={gridClass}>
              {results.map((img) =>
                renderTile({
                  key: img.id,
                  url: img.url,
                  thumb: img.thumb,
                  title: [img.title, img.creator && `by ${img.creator}`].filter(Boolean).join(' '),
                  fallback: img.url,
                })
              )}
            </div>
          )}

          {status === 'loading' && results.length === 0 && (
            <div className={gridClass}>
              {Array.from({ length: aspect === 'wide' ? 6 : 8 }).map((_, i) => (
                <div key={i} className="isp-tile isp-skeleton skeleton-pulse" />
              ))}
            </div>
          )}

          {activeQuery && status === 'done' && results.length === 0 && (
            <p className="isp-message">검색 결과가 없습니다. 다른 영어 키워드로 검색해 주세요.</p>
          )}
          {status === 'error' && (
            <p className="isp-message">이미지를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
          )}
          {status === 'limited' && (
            <p className="isp-message">검색 요청이 너무 많습니다. 1분 정도 뒤에 다시 시도해 주세요.</p>
          )}

          {hasMore && results.length > 0 && (
            <button
              type="button"
              className="isp-more"
              onClick={() => runSearch(activeQuery, page + 1)}
              disabled={status === 'loading'}
            >
              {status === 'loading' ? <Loader2 size={14} className="spin-icon" /> : '더 보기'}
            </button>
          )}

          {activeQuery && (
            <p className="isp-credit">Openverse의 자유 이용(CC0) 사진으로, 출처 표시 없이 사용할 수 있습니다.</p>
          )}
        </>
      )}

      {mode === 'url' && (
        <div className="isp-url">
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://example.com/image.jpg"
          />
          <p className="isp-hint">이미지 주소를 붙여넣으면 왼쪽 미리보기에 바로 반영됩니다.</p>
        </div>
      )}
    </div>
  );
}
