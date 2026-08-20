import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import './Modal.css';

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  bodyOnScroll,
  size = 'md',
  className = '',
}) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);
  const mouseDownTargetRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setIsAnimatingOut(false);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sofar:modal-open'));
      }
    } else if (shouldRender) {
      setIsAnimatingOut(true);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sofar:modal-close'));
      }
      const timer = setTimeout(() => {
        setShouldRender(false);
        setIsAnimatingOut(false);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (isOpen && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sofar:modal-close'));
      }
    };
  }, [isOpen]);

  const handleClose = () => {
    if (isAnimatingOut) return;
    setIsAnimatingOut(true);
    setTimeout(() => {
      onClose?.();
    }, 190);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleOverlayMouseDown = (e) => {
    if (e.target === e.currentTarget) {
      mouseDownTargetRef.current = e.target;
    } else {
      mouseDownTargetRef.current = null;
    }
  };

  const handleOverlayMouseUp = (e) => {
    if (e.target === e.currentTarget && mouseDownTargetRef.current === e.currentTarget) {
      handleClose();
    }
    mouseDownTargetRef.current = null;
  };

  if (!shouldRender) return null;

  return createPortal(
    <div
      className={`sofar-modal-overlay ${isAnimatingOut ? 'is-leaving' : 'is-entering'}`}
      onMouseDown={handleOverlayMouseDown}
      onMouseUp={handleOverlayMouseUp}
    >
      <div
        className={`sofar-modal-card modal-${size} ${isAnimatingOut ? 'is-leaving' : 'is-entering'} ${className}`}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
      >
        <div className="sofar-modal-header">
          <h3 className="sofar-modal-title">{title}</h3>
          <button type="button" className="sofar-btn icon-btn sm" onClick={handleClose}>
            <X size={16} />
          </button>
        </div>
        <div className="sofar-modal-body" onScroll={bodyOnScroll}>
          {children}
        </div>
        {footer && <div className="sofar-modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
