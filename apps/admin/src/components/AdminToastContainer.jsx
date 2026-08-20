import React from 'react';
import { AlertCircle, CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import './AdminToastContainer.css';

export default function AdminToastContainer() {
  const { toasts, removeToast } = useToast();

  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="admin-toast-container">
      {toasts.map((toast) => {
        const isError = toast.type === 'error';
        const isSuccess = toast.type === 'success';
        const isWarning = toast.type === 'warning';

        return (
          <div key={toast.id} className={`admin-toast-item ${toast.type}`}>
            <div className="admin-toast-icon">
              {isError && <AlertCircle size={20} className="icon-error" />}
              {isSuccess && <CheckCircle2 size={20} className="icon-success" />}
              {isWarning && <AlertTriangle size={20} className="icon-warning" />}
              {!isError && !isSuccess && !isWarning && <Info size={20} className="icon-info" />}
            </div>
            <div className="admin-toast-content">
              {toast.title && <div className="admin-toast-title">{toast.title}</div>}
              <div className="admin-toast-msg">{toast.message}</div>
            </div>
            <button
              type="button"
              className="admin-toast-close"
              onClick={() => removeToast(toast.id)}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
