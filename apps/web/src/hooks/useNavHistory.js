import { useState, useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

const STORAGE_KEY = 'sofar_nav_max_idx';

/**
 * 브라우저 및 React Router 히스토리 스택의 현재 인덱스와 최대 인덱스를 추적하여
 * 뒤로 가기(canGoBack) 및 앞으로 가기(canGoForward) 가능 여부를 반환하는 훅
 */
export function useNavHistory() {
  const location = useLocation();
  const navType = useNavigationType();

  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  useEffect(() => {
    // react-router-dom은 히스토리 엔트리에 idx(0-based)를 부여함
    const currentIdx = typeof window.history.state?.idx === 'number'
      ? window.history.state.idx
      : 0;

    let maxIdx = 0;
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored !== null) {
        maxIdx = parseInt(stored, 10);
        if (isNaN(maxIdx)) maxIdx = 0;
      }
    } catch {
      // sessionStorage 접근 불가 환경 대비
    }

    if (navType === 'PUSH') {
      // 새로운 경로로 진입 시 기존 forward 스택은 무효화되므로 maxIdx = currentIdx
      maxIdx = currentIdx;
    } else {
      // POP/REPLACE 등의 경우 최대치 유지
      maxIdx = Math.max(maxIdx, currentIdx);
    }

    try {
      sessionStorage.setItem(STORAGE_KEY, String(maxIdx));
    } catch {
      // ignore
    }

    setCanGoBack(currentIdx > 0);
    setCanGoForward(currentIdx < maxIdx);
  }, [location, navType]);

  return { canGoBack, canGoForward };
}

export default useNavHistory;
