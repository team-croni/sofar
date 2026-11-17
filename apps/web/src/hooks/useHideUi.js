import { useSyncExternalStore, useCallback } from 'react';

/**
 * UI 숨기기 모드 전역 상태
 * - 사이드바 · 하단 컨트롤러와 레이아웃 크기는 그대로 두고,
 *   Now Playing 영역의 헤더 · 가사 툴바 · 플로팅 버튼만 숨깁니다.
 * - <html>에 'ui-hidden' 클래스를 붙여 CSS로 처리합니다. ESC로 다시 보입니다.
 */

let isHidden = false;
const listeners = new Set();

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
  if (next) window.addEventListener('keydown', handleKeyDown);
  else window.removeEventListener('keydown', handleKeyDown);
  emit();
}

export function useHideUi() {
  const uiHidden = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const toggle = useCallback(() => setUiHidden(!isHidden), []);
  return { isUiHidden: uiHidden, setUiHidden, toggleUiHidden: toggle };
}
