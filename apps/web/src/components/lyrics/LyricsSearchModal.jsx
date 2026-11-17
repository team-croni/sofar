import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, Loader2, AlertCircle, SearchX, RotateCcw, Check } from 'lucide-react';
import { Modal, Button, Input } from '../ui';
import {
  buildSearchTarget,
  searchLyricCandidates,
  rankCandidates,
  getCandidateLyrics,
  getLyricsDedupeKey,
  getPlainLines,
  formatDuration,
  RECOMMEND_THRESHOLD,
} from '../../utils/lyricsSearch';
import './LyricsSearchModal.css';

const SEARCH_DEBOUNCE_MS = 450;

/**
 * 가사 검색 모달 (2단 레이아웃)
 * - 좌측: 제목/아티스트 분리 검색 + 적합도순 결과 목록
 * - 우측: 선택한 후보의 전체 가사 미리보기 + 적용
 */
export default function LyricsSearchModal({
  isOpen,
  onClose,
  track,            // { title, artist, duration }
  currentLyrics,    // 현재 화면에 적용된 raw LRC
  hasCustomLyrics,  // 사용자가 직접 지정한 가사인지
  onApply,          // (lyrics: string) => void
  onReset,          // () => void
}) {
  // 닫히는 애니메이션 중에는 열려 있던 마지막 상태를 그대로 보여준다 (적용 직후 '현재 가사' 표시가 튀지 않도록)
  const frozenRef = useRef({ currentLyrics, hasCustomLyrics });
  if (isOpen) frozenRef.current = { currentLyrics, hasCustomLyrics };
  ({ currentLyrics, hasCustomLyrics } = frozenRef.current);

  const [titleQuery, setTitleQuery] = useState('');
  const [artistQuery, setArtistQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [status, setStatus] = useState('idle'); // idle | loading | done | error

  const abortRef = useRef(null);
  const debounceRef = useRef(null);
  const listRef = useRef(null);
  const previewRef = useRef(null);
  const rootRef = useRef(null);

  // 점수 계산 기준은 '현재 재생 중인 곡' (검색어를 바꿔도 원곡 대비 적합도로 정렬)
  const target = useMemo(
    () => ({ title: track?.title || '', artist: track?.artist || '', duration: track?.duration || 0 }),
    [track?.title, track?.artist, track?.duration]
  );

  const runSearch = useCallback(async (title, artist) => {
    clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    if (!title.trim() && !artist.trim()) {
      setResults([]);
      setStatus('idle');
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('loading');

    try {
      const candidates = await searchLyricCandidates({ title, artist }, { signal: controller.signal, broad: true });
      if (controller.signal.aborted) return;
      setResults(rankCandidates(candidates, target));
      setSelectedIndex(0);
      setStatus('done');
      listRef.current?.scrollTo({ top: 0 });
    } catch (err) {
      if (err?.name === 'AbortError') return;
      console.error('Lyrics search error:', err);
      setStatus('error');
    }
  }, [target]);

  // 모달이 열릴 때 현재 곡 정보로 검색어를 채우고 즉시 검색
  useEffect(() => {
    if (!isOpen) return;
    const initial = buildSearchTarget(track?.title, track?.artist);
    setTitleQuery(initial.title);
    setArtistQuery(initial.artist);
    setResults([]);
    setSelectedIndex(0);
    runSearch(initial.title, initial.artist);
    requestAnimationFrame(() => rootRef.current?.querySelector('.lsm-field-title input')?.focus());
    return () => {
      clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
    // 열릴 때 한 번만 초기화
  }, [isOpen]);

  const scheduleSearch = (title, artist) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(title, artist), SEARCH_DEBOUNCE_MS);
  };

  const handleTitleChange = (e) => {
    setTitleQuery(e.target.value);
    scheduleSearch(e.target.value, artistQuery);
  };

  const handleArtistChange = (e) => {
    setArtistQuery(e.target.value);
    scheduleSearch(titleQuery, e.target.value);
  };

  const selected = results[selectedIndex] || null;
  const selectedLyrics = selected ? getCandidateLyrics(selected.cand) : '';
  const currentKey = currentLyrics ? currentLyrics.replace(/\s+/g, ' ').trim() : '';
  // 결과는 가사 본문 기준으로 중복 제거되므로 '적용됨'은 최대 한 곳에만 표시된다
  const appliedIndex = currentKey ? results.findIndex(({ cand }) => getLyricsDedupeKey(cand) === currentKey) : -1;
  const isSelectedApplied = selected != null && selectedIndex === appliedIndex;

  const applySelected = () => {
    if (!selected || isSelectedApplied) return;
    onApply(selectedLyrics);
  };

  const moveSelection = (delta) => {
    if (results.length === 0) return;
    setSelectedIndex((prev) => {
      const next = Math.min(results.length - 1, Math.max(0, prev + delta));
      const el = listRef.current?.children[next];
      el?.scrollIntoView({ block: 'nearest' });
      return next;
    });
  };

  const handleInputKeyDown = (e) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); moveSelection(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveSelection(-1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.metaKey || e.ctrlKey) applySelected();
      else runSearch(titleQuery, artistQuery);
    }
  };

  // 선택이 바뀌면 미리보기 맨 위로
  useEffect(() => {
    previewRef.current?.scrollTo({ top: 0 });
  }, [selectedIndex, results]);

  const previewLines = useMemo(() => (selected ? getPlainLines(selected.cand) : []), [selected]);

  const renderList = () => {
    if (status === 'loading' && results.length === 0) {
      return (
        <div className="lsm-state">
          <Loader2 size={20} className="spin-animation" />
          <span>가사를 찾는 중...</span>
        </div>
      );
    }
    if (status === 'error') {
      return (
        <div className="lsm-state is-error">
          <AlertCircle size={20} />
          <span>가사 서버에 연결하지 못했습니다.</span>
          <span className="lsm-state-hint">잠시 후 다시 시도해 주세요.</span>
          <button type="button" className="lsm-text-btn" onClick={() => runSearch(titleQuery, artistQuery)}>
            다시 시도
          </button>
        </div>
      );
    }
    if (status === 'idle') {
      return (
        <div className="lsm-state">
          <Search size={20} />
          <span>곡 제목이나 아티스트를 입력하세요.</span>
        </div>
      );
    }
    if (results.length === 0) {
      return (
        <div className="lsm-state">
          <SearchX size={20} />
          <span>검색 결과가 없습니다.</span>
          <span className="lsm-state-hint">제목을 짧게 줄이거나 아티스트를 비워 보세요.</span>
        </div>
      );
    }

    return (
      <ul className="lsm-result-list scrollbar-none" ref={listRef} role="listbox" aria-label="가사 검색 결과">
        {results.map(({ cand, score }, idx) => {
          const isApplied = idx === appliedIndex;
          const isRecommended = !isApplied && score >= RECOMMEND_THRESHOLD;
          return (
            <li
              key={cand.id ?? idx}
              role="option"
              aria-selected={idx === selectedIndex}
              className={`lsm-row ${idx === selectedIndex ? 'is-selected' : ''} ${isApplied ? 'is-applied' : ''}`}
              onClick={() => setSelectedIndex(idx)}
              onDoubleClick={() => { setSelectedIndex(idx); if (!isApplied) onApply(getCandidateLyrics(cand)); }}
            >
              <div className="lsm-row-texts">
                <div className="lsm-row-title">
                  {isApplied && <Check size={13} className="lsm-row-applied-icon" aria-label="현재 적용된 가사" />}
                  <span>{cand.trackName}</span>
                </div>
                <div className="lsm-row-sub">
                  {cand.artistName}
                  {cand.albumName ? ` · ${cand.albumName}` : ''}
                </div>
              </div>
              <div className="lsm-row-meta">
                {isApplied ? (
                  <span className="lsm-row-label is-applied">현재 가사</span>
                ) : isRecommended ? (
                  <span className="lsm-row-label is-recommended">추천</span>
                ) : null}
                {!cand.syncedLyrics && <span className="lsm-row-label">싱크 없음</span>}
                <span className="lsm-row-duration">{formatDuration(cand.duration)}</span>
              </div>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="가사 검색" size="xl" className="lsm-modal">
      <div className="lsm-root" ref={rootRef}>
        <form
          className="lsm-search-row"
          onSubmit={(e) => { e.preventDefault(); runSearch(titleQuery, artistQuery); }}
        >
          <Input
            className="lsm-field lsm-field-title"
            placeholder="곡 제목"
            value={titleQuery}
            onChange={handleTitleChange}
            onKeyDown={handleInputKeyDown}
            aria-label="곡 제목"
          />
          <Input
            className="lsm-field lsm-field-artist"
            placeholder="아티스트 (선택)"
            value={artistQuery}
            onChange={handleArtistChange}
            onKeyDown={handleInputKeyDown}
            aria-label="아티스트"
          />
          <Button type="submit" variant="primary" size="md" className="lsm-submit" aria-label="검색">
            {status === 'loading' ? <Loader2 size={17} className="spin-animation" /> : <Search size={17} />}
          </Button>
        </form>

        <div className="lsm-body">
          <section className="lsm-pane lsm-pane-list">
            <div className="lsm-pane-head">
              <span>{status === 'done' ? `결과 ${results.length}개` : '결과'}</span>
              <span className="lsm-pane-head-hint">현재 곡과 가까운 순</span>
            </div>
            {renderList()}
          </section>

          <section className="lsm-pane lsm-pane-preview">
            {selected ? (
              <>
                <div className="lsm-preview-head">
                  <div className="lsm-preview-title">{selected.cand.trackName}</div>
                  <div className="lsm-preview-sub">
                    {selected.cand.artistName}
                    {selected.cand.albumName ? ` · ${selected.cand.albumName}` : ''}
                  </div>
                  {target.duration > 0 && selected.cand.duration > 0 && (
                    <div className="lsm-preview-duration">
                      길이 {formatDuration(selected.cand.duration)}
                      <span> / 현재 곡 {formatDuration(target.duration)}</span>
                    </div>
                  )}
                </div>
                <div className="lsm-preview-lines scrollbar-none" ref={previewRef}>
                  {previewLines.map((line, idx) => (
                    <p key={idx} className={line ? '' : 'is-gap'}>{line || ' '}</p>
                  ))}
                </div>
              </>
            ) : (
              <div className="lsm-state">
                <span>결과를 선택하면 전체 가사를 미리 볼 수 있어요.</span>
              </div>
            )}
          </section>
        </div>

        <div className="lsm-footer">
          {hasCustomLyrics ? (
            <Button variant="ghost" size="sm" leadingIcon={<RotateCcw size={13} />} onClick={onReset}>
              자동 매칭으로 되돌리기
            </Button>
          ) : (
            <span className="lsm-footer-hint">↑↓ 이동 · ⌘/Ctrl+Enter 적용 · 더블클릭 적용</span>
          )}
          <div className="lsm-footer-actions">
            <Button variant="secondary" size="sm" onClick={onClose}>취소</Button>
            <Button
              variant="primary"
              size="sm"
              onClick={applySelected}
              disabled={!selected || isSelectedApplied}
            >
              {isSelectedApplied ? '적용된 가사' : '가사 적용'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
