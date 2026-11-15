import React, { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useHideUi } from '../../hooks/useHideUi';

/**
 * Now Playing 화면 우측 상단의 "UI 숨기기 / UI 보이기" 토글 버튼
 * - 숨긴 상태에서는 버튼도 화면에서 사라지고, 마우스를 움직이면 2초간 다시 나타남
 */
export default function HideUiToggle() {
  const { isUiHidden, toggleUiHidden } = useHideUi();
  const [isIdle, setIsIdle] = useState(false);

  useEffect(() => {
    if (!isUiHidden) {
      setIsIdle(false);
      return undefined;
    }
    let timer = null;
    const sleep = () => {
      clearTimeout(timer);
      setIsIdle(true);
    };
    const wake = () => {
      setIsIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIsIdle(true), 2000);
    };
    // Now Playing 영역(또는 버튼 자체) 위에서 움직일 때만 나타나고,
    // 사이드바·하단 컨트롤러 등 다른 영역으로 마우스가 나가면 바로 사라짐
    const handleMove = (e) => {
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest('.main-hide-ui-btn')) {
        // 버튼 위에 마우스가 머무는 동안에는 계속 보임
        clearTimeout(timer);
        setIsIdle(false);
      } else if (target?.closest('.right-main-content, .main-bottom-right-actions')) {
        wake();
      } else {
        sleep();
      }
    };
    wake();
    window.addEventListener('mousemove', handleMove);
    document.documentElement.addEventListener('mouseleave', sleep);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousemove', handleMove);
      document.documentElement.removeEventListener('mouseleave', sleep);
    };
  }, [isUiHidden]);

  return (
    <button
      type="button"
      className={`main-hide-ui-btn ${isUiHidden && isIdle ? 'is-idle' : ''}`}
      onClick={toggleUiHidden}
      title={isUiHidden ? 'UI 보이기 (ESC)' : 'UI 숨기기'}
    >
      {isUiHidden ? <Eye size={14} /> : <EyeOff size={14} />}
      {isUiHidden ? 'UI 보이기' : 'UI 숨기기'}
    </button>
  );
}
