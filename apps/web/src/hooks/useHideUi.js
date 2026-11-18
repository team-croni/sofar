import { useSyncExternalStore, useCallback } from 'react';

/**
 * UI 숨기기 모드 전역 상태
 * - 사이드바 · 하단 컨트롤러와 레이아웃 크기는 그대로 두고,
 *   Now Playing 영역의 헤더 · 가사 툴바 · 플로팅 버튼만 숨깁니다.
 * - <html>에 'ui-hidden' 클래스를 붙여 CSS로 처리합니다. ESC로 다시 보입니다.
 */

let isHidden = false;
const listeners = new Set();

// NowPlayingBackdrop.css의 html.ui-hidden 숨김 대상과 같은 목록
// (헤더는 블러 유지를 위해 헤더 자체가 아니라 자식과 ::before를 페이드)
const HIDEABLE_SELECTOR = [
  '.right-panel-header > *',
  '.lyrics-sync-bar',
  '.lyrics-empty-actions',
  '.main-match-feedback',
  '.main-youtube-btn',
].join(',');

const FADE_IN = [{ opacity: 0, offset: 0 }]; // offset 0을 명시해야 '시작' 키프레임 (단일 키프레임은 기본이 끝 지점)
const FADE_IN_TIMING = { duration: 350, easing: 'ease' };

/**
 * 다시 보일 때 투명도 0 → 원래 값으로 페이드인.
 * ui-hidden이 빠지면 숨김 쪽 transition도 같이 사라져 확 나타나므로 Web Animations API로 그린다.
 * 끝 키프레임을 비워 두면 원래 값(호버 전용 툴바면 0, 헤더 블러면 스크롤 opacity)으로 끝난다.
 */
function fadeInHideables() {
  document.querySelectorAll(HIDEABLE_SELECTOR).forEach((el) => {
    el.animate?.(FADE_IN, FADE_IN_TIMING);
  });
  document.querySelectorAll('.right-panel-header').forEach((el) => {
    el.animate?.(FADE_IN, { ...FADE_IN_TIMING, pseudoElement: '::before' });
  });
}

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return isHidden;
}

function handleKeyDown(e) {
  if (e.key === 'Escape' && isHidden) {
    setUiHidden(false);
  }
}

export function setUiHidden(next) {
  if (next === isHidden) return;
  isHidden = next;
  document.documentElement.classList.toggle('ui-hidden', next);
  if (!next) fadeInHideables();
  if (next) window.addEventListener('keydown', handleKeyDown);
  else window.removeEventListener('keydown', handleKeyDown);
  emit();
}

export function useHideUi() {
  const uiHidden = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const toggle = useCallback(() => setUiHidden(!isHidden), []);
  return { isUiHidden: uiHidden, setUiHidden, toggleUiHidden: toggle };
}
