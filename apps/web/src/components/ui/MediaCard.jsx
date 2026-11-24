import React from 'react';
import { MoreVertical } from 'lucide-react';
import './MediaCard.css';

/**
 * 노래 카드(TrackCard)와 플레이리스트 카드(PlaylistCard)가 같이 쓰는 조각.
 * 모양은 MediaCard.css의 .media-card* 클래스에 있다.
 */

/**
 * 커버는 키보드로도 누를 수 있는 '버튼 역할' 요소다.
 * 진짜 <button>이면 드래그 유틸이 버튼에서 시작한 드래그를 막기 때문에 div로 두고,
 * Enter/Space를 누르면 클릭을 일으켜 카드의 클릭 동작(재생/열기)으로 이어지게 한다.
 */
export function handleCoverKeyDown(e) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    e.currentTarget.click();
  }
}

/** Dropdown / TrackActionDropdown의 trigger로 넘기는 더보기(⋮) 버튼 */
export function mediaCardKebabTrigger(isOpen) {
  return (
    <button
      type="button"
      className={`media-card__kebab ${isOpen ? 'active' : ''}`}
      title="더보기"
      aria-label="더보기"
    >
      <MoreVertical size={14} strokeWidth={1.5} fill="currentColor" />
    </button>
  );
}

/** 제목 줄 오른쪽 더보기 메뉴 자리: 눌러도 카드 클릭·드래그로 번지지 않게 막는다 */
export function MediaCardActions({ children }) {
  return (
    <div
      className="media-card__actions"
      data-no-dnd="true"
      draggable={false}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}
