import React, { useEffect, useState } from 'react';
import { History, TrendingUp, Music2, Mic2, X } from 'lucide-react';
import { Badge } from '../ui';
import './SearchAutocomplete.css';

const KEYWORD_ICONS = {
  recent: { Icon: History, label: '최근 검색어' },
  trending: { Icon: TrendingUp, label: '인기 검색어' },
};

const isMusicType = (type) => type === 'artist' || type === 'track';

// 음원 항목은 그룹별 제목 아래에 묶어서 표시 (키워드 그룹은 아이콘으로 구분되므로 제목 없음)
const GROUP_TITLES = { artist: '아티스트', track: '곡' };
const groupOf = (type) => (isMusicType(type) ? type : 'keyword');

/** 입력어와 일치하는 부분을 강조 (대소문자 무시, 정규식 미사용) */
function highlight(text, query) {
  const q = query.trim();
  if (!q) return text;
  const lowerText = text.toLowerCase();
  const lowerQ = q.toLowerCase();
  const parts = [];
  let cursor = 0;
  let idx = lowerText.indexOf(lowerQ);
  while (idx !== -1) {
    if (idx > cursor) parts.push(text.slice(cursor, idx));
    parts.push(
      <mark key={idx} className="search-ac-highlight">{text.slice(idx, idx + q.length)}</mark>
    );
    cursor = idx + q.length;
    idx = lowerText.indexOf(lowerQ, cursor);
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

/** 음원 썸네일. 이미지가 없거나 깨지면 아이콘 플레이스홀더로 대체 */
function SuggestionThumb({ type, src }) {
  const [failed, setFailed] = useState(false);
  const FallbackIcon = type === 'artist' ? Mic2 : Music2;
  return (
    <span className={`search-ac-thumb search-ac-thumb--${type}`} aria-hidden="true">
      {src && !failed ? (
        <img src={src} alt="" loading="lazy" draggable="false" onError={() => setFailed(true)} />
      ) : (
        <FallbackIcon size={14} />
      )}
    </span>
  );
}

export const getSuggestionOptionId = (listId, index) => `${listId}-opt-${index}`;

export default function SearchAutocomplete({
  listId,
  items,
  query,
  activeIndex,
  onSelect,
  onHover,
  onRemoveRecent,
  loading = false,
}) {
  // 키보드로 이동한 항목이 스크롤 영역 밖이면 보이도록 스크롤
  useEffect(() => {
    if (activeIndex < 0) return;
    document.getElementById(getSuggestionOptionId(listId, activeIndex))?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, listId]);

  const hasItems = items && items.length > 0;
  if (!hasItems && !loading) return null;

  return (
    <ul id={listId} role="listbox" className="search-ac-dropdown scrollbar-none" aria-label="검색어 자동완성">
      {items.map((item, index) => {
        const isActive = index === activeIndex;
        const isMusic = isMusicType(item.type);
        const group = groupOf(item.type);
        const startsGroup = index === 0 || groupOf(items[index - 1].type) !== group;
        const groupTitle = startsGroup ? GROUP_TITLES[group] : null;
        const keyword = KEYWORD_ICONS[item.type];

        return (
          <React.Fragment key={`${item.type}-${item.term}`}>
          {groupTitle && (
            <li
              role="presentation"
              className={`search-ac-group-title ${index > 0 ? 'has-divider' : ''}`}
            >
              {groupTitle}
            </li>
          )}
          <li
            id={getSuggestionOptionId(listId, index)}
            role="option"
            aria-selected={isActive}
            className={[
              'search-ac-item',
              `search-ac-item--${item.type}`,
              isActive ? 'is-active' : '',
            ].join(' ')}
            // blur보다 먼저 실행되도록 mousedown에서 포커스 이동을 막음
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelect(item)}
            onMouseMove={() => { if (!isActive) onHover(index); }}
          >
            {isMusic ? (
              <SuggestionThumb type={item.type} src={item.thumbnail} />
            ) : (
              <span className="search-ac-icon" aria-label={keyword?.label}>
                {keyword && <keyword.Icon size={16} />}
              </span>
            )}

            <span className="search-ac-body">
              <span className="search-ac-label">{highlight(item.label, query)}</span>
              {item.sub && <span className="search-ac-sub">{item.sub}</span>}
            </span>

            {item.type === 'trending' && <Badge className="search-ac-badge">인기</Badge>}

            {item.type === 'recent' && onRemoveRecent && (
              <button
                type="button"
                className="search-ac-remove"
                title="최근 검색어에서 삭제"
                aria-label={`'${item.label}' 최근 검색어에서 삭제`}
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveRecent(item.term, e);
                }}
              >
                <X size={13} />
              </button>
            )}
          </li>
          </React.Fragment>
        );
      })}

      {/* 음원 제안 로딩 중: 자리만 먼저 잡아 자동완성이 동작 중임을 바로 보여줌 */}
      {loading && (
        <li role="presentation" className={`search-ac-group-title ${hasItems ? 'has-divider' : ''}`}>
          곡
        </li>
      )}
      {loading && [0, 1, 2].map((i) => (
        <li
          key={`skeleton-${i}`}
          aria-hidden="true"
          className="search-ac-item search-ac-item--skeleton"
        >
          <span className="search-ac-thumb skeleton-pulse" />
          <span className="search-ac-body">
            <span className="search-ac-skeleton-line skeleton-pulse" style={{ width: `${[52, 38, 46][i]}%` }} />
            <span className="search-ac-skeleton-line search-ac-skeleton-line--sub skeleton-pulse" style={{ width: `${[24, 30, 20][i]}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}
