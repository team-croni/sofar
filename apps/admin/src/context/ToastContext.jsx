import React, { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message, type = 'error', title = '') => {
    if (!message) return;
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newToast = { id, message, type, title };

    setToasts((prev) => [...prev, newToast]);

    setTimeout(() => {
      removeToast(id);
    }, 4000);
  }, [removeToast]);

  const showErrorToast = useCallback((msg, title = '오류 발생') => {
    addToast(msg, 'error', title);
  }, [addToast]);

  const showSuccessToast = useCallback((msg, title = '성공') => {
    addToast(msg, 'success', title);
  }, [addToast]);

  const showWarningToast = useCallback((msg, title = '주의') => {
    addToast(msg, 'warning', title);
  }, [addToast]);

  const showInfoToast = useCallback((msg, title = '알림') => {
    addToast(msg, 'info', title);
  }, [addToast]);

  return (
    <ToastContext.Provider
      value={{
        toasts,
        addToast,
        removeToast,
        showErrorToast,
        showSuccessToast,
        showWarningToast,
        showInfoToast,
      }}
    >
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
