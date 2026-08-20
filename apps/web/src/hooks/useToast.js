import { useState, useCallback, useRef } from 'react';

/**
 * 알림 토스트 상태 관리 및 자동 퇴장 타이머 전용 커스텀 훅
 */
export function useToast() {
  const [toastMessage, setToastMessage] = useState("");
  const [isToastVisible, setIsToastVisible] = useState(false);
  const toastTimeoutRef = useRef(null);

  const showToast = useCallback((msg) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToastMessage(msg);
    setIsToastVisible(true);

    toastTimeoutRef.current = setTimeout(() => {
      setIsToastVisible(false);
    }, 2500);
  }, []);

  return {
    toastMessage,
    isToastVisible,
    showToast,
  };
}
