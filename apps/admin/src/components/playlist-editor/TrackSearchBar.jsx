import React, { useState, useRef, useEffect } from 'react';
import { Search, Loader2, Music, Plus } from 'lucide-react';
import { usePlaylistEditor } from './PlaylistEditorContext';

export default function TrackSearchBar() {
  const {
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearchLoading,
    isSearchOpen,
    setIsSearchOpen,
    handleAddSearchTrack,
  } = usePlaylistEditor();

  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const dropdownRef = useRef(null);

  // 하이라이트된 항목이 스크롤 뷰 안에 보이도록
  useEffect(() => {
    if (highlightedIndex < 0 || !dropdownRef.current) return;
    const items = dropdownRef.current.querySelectorAll('.autocomplete-item');
    if (items[highlightedIndex]) {
      items[highlightedIndex].scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex]);

  const handleKeyDown = (e) => {
    // 한글 IME 조합 중 발생하는 중복 keydown 이벤트 차단
    if (e.isComposing || e.nativeEvent?.isComposing) return;

    if (!isSearchOpen || searchResults.length === 0) {
      if (e.key === 'Enter') {
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < searchResults.length - 1 ? prev + 1 : 0
        );
        break;

      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : searchResults.length - 1
        );
        break;

      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < searchResults.length) {
          handleAddSearchTrack(searchResults[highlightedIndex]);
          setHighlightedIndex(-1);
        }
        break;

      case 'Escape':
        e.preventDefault();
        setIsSearchOpen(false);
        setHighlightedIndex(-1);
        break;

      default:
        break;
    }
  };

  return (
    <div className="track-search-wrapper">
      <div className="track-search-container">
        <Search size={16} className="track-search-icon" />
        <input
          type="text"
          className="sofar-input-field track-search-input"
          placeholder="곡명 또는 아티스트 검색"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setHighlightedIndex(-1);
            if (e.target.value.trim().length >= 2) {
              setIsSearchOpen(true);
            }
          }}
          onFocus={() => {
            if (searchResults.length > 0) setIsSearchOpen(true);
          }}
          onKeyDown={handleKeyDown}
        />
      </div>

      {/* 실시간 음원 검색 결과 팝업 */}
      {isSearchOpen && !isSearchLoading && (
        <div className="autocomplete-dropdown-overlay">
          <div className="autocomplete-body scrollbar-none" ref={dropdownRef}>
            {searchResults.length > 0 ? (
              searchResults.map((sug, sIdx) => {
                const itemThumb = sug.thumbnail || (sug.youtube_video_id ? `https://img.youtube.com/vi/${sug.youtube_video_id}/hqdefault.jpg` : '');
                return (
                  <div
                    key={sug.youtube_video_id || sIdx}
                    className={`autocomplete-item${sIdx === highlightedIndex ? ' highlighted' : ''}`}
                    onClick={() => handleAddSearchTrack(sug)}
                  >
                    <div className="autocomplete-item-cover">
                      {itemThumb ? (
                        <img
                          src={itemThumb}
                          alt=""
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                      ) : (
                        <Music size={14} className="empty-state-icon" />
                      )}
                    </div>
                    <div className="autocomplete-item-text">
                      <span className="autocomplete-title">{sug.custom_title}</span>
                      <span className="autocomplete-artist">{sug.custom_artist}</span>
                    </div>
                    <div className="autocomplete-item-action" title="큐레이션에 추가">
                      <Plus size={20} />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="autocomplete-empty">검색 결과가 없습니다.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
