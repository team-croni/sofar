import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';
import './Dropdown.css';

export default function Dropdown({ options, trigger, align = 'right', children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [isMeasured, setIsMeasured] = useState(false);
  const triggerRef = useRef(null);
  const dropdownMenuRef = useRef(null);

  const updateCoords = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    
    const menuWidth = dropdownMenuRef.current ? dropdownMenuRef.current.offsetWidth : 185;
    const menuHeight = dropdownMenuRef.current ? dropdownMenuRef.current.offsetHeight : 150;

    let top = rect.bottom + 6;
    let left = rect.left;

    if (align === 'right') {
      left = rect.right - menuWidth;
    }

    // Horizontal bounds constraint
    const viewportWidth = window.innerWidth;
    if (left + menuWidth > viewportWidth - 12) {
      left = viewportWidth - menuWidth - 12;
    }
    if (left < 12) {
      left = 12;
    }

    // Dynamic bottom limit based on viewport, bottom player bar, and floating MiniPlayer
    let bottomLimit = window.innerHeight - 12;

    const bottomPlayerEl = document.querySelector('.bottom-player-bar');
    if (bottomPlayerEl) {
      const bRect = bottomPlayerEl.getBoundingClientRect();
      if (bRect.top > 0) {
        bottomLimit = Math.min(bottomLimit, bRect.top - 8);
      }
    }

    const miniPlayerEl = document.querySelector('.mini-player-container.show');
    if (miniPlayerEl) {
      const mRect = miniPlayerEl.getBoundingClientRect();
      const popoverRight = left + menuWidth;
      const overlapsX = !(popoverRight < mRect.left || left > mRect.right);
      if (overlapsX && mRect.top > 0) {
        bottomLimit = Math.min(bottomLimit, mRect.top - 8);
      }
    }

    // Vertical bounds constraint (flip up if opening down overflows bottomLimit)
    const spaceBelow = bottomLimit - (rect.bottom + 6);
    const spaceAbove = rect.top - 6;

    let shouldFlipUp = false;
    if (top + menuHeight > bottomLimit) {
      if (spaceAbove >= menuHeight || spaceAbove > spaceBelow) {
        shouldFlipUp = true;
      }
    }

    if (shouldFlipUp) {
      top = rect.top - 6 - menuHeight;
      if (top < 12) {
        top = 12;
      }
    } else {
      if (top + menuHeight > bottomLimit) {
        top = Math.max(12, bottomLimit - menuHeight);
      }
    }

    setCoords({ top, left });
  }, [align]);

  const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useEffect : useEffect;

  useIsomorphicLayoutEffect(() => {
    if (isOpen) {
      updateCoords();
      setIsMeasured(true);
    } else {
      setIsMeasured(false);
    }
  }, [isOpen, updateCoords]);

  useEffect(() => {
    if (!isOpen) return;

    let resizeObserver;
    if (dropdownMenuRef.current && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        updateCoords();
      });
      resizeObserver.observe(dropdownMenuRef.current);
    }

    return () => {
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [isOpen, updateCoords]);

  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e) => {
      if (
        (triggerRef.current && triggerRef.current.contains(e.target)) ||
        (dropdownMenuRef.current && dropdownMenuRef.current.contains(e.target))
      ) {
        return;
      }
      setIsOpen(false);
    };

    const handleScroll = (e) => {
      // 1. 드롭다운 메뉴 내부 자체 스크롤은 허용
      if (dropdownMenuRef.current && dropdownMenuRef.current.contains(e.target)) {
        return;
      }

      // 2. 드롭다운 메뉴 외부의 어떤 요소든 스크롤 발생 시 즉시 닫기
      setIsOpen(false);
    };

    const handleResize = () => {
      setIsOpen(false);
    };

    document.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('scroll', handleScroll, true); // capture scroll in any outer container
    window.addEventListener('resize', handleResize);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [isOpen, updateCoords]);

  const handleTriggerClick = (e) => {
    e.stopPropagation();
    setIsOpen(prev => !prev);
  };

  return (
    <div 
      className="sofar-dropdown"
      draggable={false}
      onMouseDown={(e) => e.stopPropagation()}
      onDragStart={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div 
        ref={triggerRef} 
        style={{ display: 'inline-flex' }}
        draggable={false}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {trigger ? (
          <div 
            onClick={handleTriggerClick} 
            onMouseDown={(e) => e.stopPropagation()}
            draggable={false}
            style={{ display: 'inline-flex' }}
          >
            {trigger(isOpen)}
          </div>
        ) : (
          <button 
            onClick={handleTriggerClick} 
            onMouseDown={(e) => e.stopPropagation()}
            draggable={false}
            className={`sofar-dropdown-trigger-btn ${isOpen ? 'active' : ''}`}
            title="더보기"
          >
            <MoreVertical size={18} strokeWidth={1.5} fill='currentcolor' />
          </button>
        )}
      </div>

      {isOpen && createPortal(
        <div 
          ref={dropdownMenuRef}
          className={`sofar-dropdown-menu ${isMeasured ? 'is-ready' : ''}`}
          style={{ 
            position: 'fixed',
            top: `${coords.top}px`, 
            left: `${coords.left}px`,
            margin: 0,
            opacity: isMeasured ? 1 : 0,
            visibility: isMeasured ? 'visible' : 'hidden',
          }}
        >
          {children ? (
            typeof children === 'function' ? children(() => setIsOpen(false)) : children
          ) : (
            options && options.map((option, idx) => {
              if (!option) return null;
              return (
                <button
                  key={idx}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(false);
                    if (option.onClick) option.onClick(e);
                  }}
                  className={`sofar-dropdown-item ${option.className || ''}`}
                >
                  {option.icon && <span className="dropdown-item-icon">{option.icon}</span>}
                  <span className="dropdown-item-label">{option.label}</span>
                </button>
              );
            })
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
