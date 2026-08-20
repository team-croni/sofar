import React from 'react';

export default function RankChangeBadge({ type, val }) {
  if (type === 'up') {
    return (
      <span className="rank-badge rank-badge--up" title={`상승 ${val || 1}계단`}>
        <span className="rank-arrow">▲</span>
        {val && <span className="rank-val">{val}</span>}
      </span>
    );
  }
  if (type === 'down') {
    return (
      <span className="rank-badge rank-badge--down" title={`하락 ${val || 1}계단`}>
        <span className="rank-arrow">▼</span>
        {val && <span className="rank-val">{val}</span>}
      </span>
    );
  }
  if (type === 'new') {
    return <span className="rank-badge rank-badge--new" title="신규 진입">NEW</span>;
  }
  return <span className="rank-badge rank-badge--same" title="변동 없음">-</span>;
}
