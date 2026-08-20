import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function HScrollSection({ title, actions, onTitleClick, children }) {
  const scrollRef = useRef(null);
  const trackRef = useRef(null);

  const isMouseDown = useRef(false);
  const startX = useRef(0);
  const scrollLeftPos = useRef(0);
  const isDragging = useRef(false);

  // 관성 및 러버밴드 바운스 Physics Ref
  const lastX = useRef(0);
  const lastTime = useRef(0);
  const velocityX = useRef(0);
  const overscrollOffset = useRef(0);
  const animFrameId = useRef(null);

  const applyOverscroll = (offset) => {
    overscrollOffset.current = offset;
    if (trackRef.current) {
      trackRef.current.style.transform = offset !== 0 ? `translateX(${offset}px)` : '';
    }
  };

  const scroll = (dir) => {
    if (animFrameId.current) cancelAnimationFrame(animFrameId.current);
    applyOverscroll(0);
    scrollRef.current?.scrollBy({ left: dir * 280, behavior: 'smooth' });
  };

  const handleMouseDown = (e) => {
    if (!scrollRef.current) return;
    if (animFrameId.current) cancelAnimationFrame(animFrameId.current);

    isMouseDown.current = true;
    isDragging.current = false;
    startX.current = e.pageX - scrollRef.current.offsetLeft;
    scrollLeftPos.current = scrollRef.current.scrollLeft;

    lastX.current = e.pageX;
    lastTime.current = performance.now();
    velocityX.current = 0;

    scrollRef.current.classList.add('is-dragging');
  };

  const handleMouseMove = (e) => {
    if (!isMouseDown.current || !scrollRef.current) return;

    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX.current) * 1.35;

    if (Math.abs(walk) > 5) {
      isDragging.current = true;
    }

    const now = performance.now();
    const dt = now - lastTime.current;
    if (dt > 0) {
      velocityX.current = (e.pageX - lastX.current) / dt;
    }
    lastX.current = e.pageX;
    lastTime.current = now;

    const maxScroll = scrollRef.current.scrollWidth - scrollRef.current.clientWidth;
    const targetScroll = scrollLeftPos.current - walk;

    if (targetScroll < 0) {
      scrollRef.current.scrollLeft = 0;
      const overflow = -targetScroll;
      const elastic = Math.min(30, overflow * 0.18);
      applyOverscroll(elastic);
    } else if (targetScroll > maxScroll) {
      scrollRef.current.scrollLeft = maxScroll;
      const overflow = targetScroll - maxScroll;
      const elastic = Math.min(30, overflow * 0.18);
      applyOverscroll(-elastic);
    } else {
      applyOverscroll(0);
      scrollRef.current.scrollLeft = targetScroll;
    }
  };

  const handleMouseLeaveOrUp = () => {
    if (!isMouseDown.current) return;
    isMouseDown.current = false;

    if (scrollRef.current) {
      let v = velocityX.current * 16;
      let over = overscrollOffset.current;
      const friction = 0.94;

      const step = () => {
        if (!scrollRef.current) return;
        const maxScroll = scrollRef.current.scrollWidth - scrollRef.current.clientWidth;

        if (over !== 0 || (scrollRef.current.scrollLeft <= 0 && v > 0) || (scrollRef.current.scrollLeft >= maxScroll && v < 0)) {
          over += v * 0.35;
          v *= 0.65;
          over += (0 - over) * 0.18;

          applyOverscroll(over);

          if (Math.abs(over) < 0.4 && Math.abs(v) < 0.2) {
            applyOverscroll(0);
            if (scrollRef.current) scrollRef.current.classList.remove('is-dragging');
            return;
          }
        } else {
          scrollRef.current.scrollLeft -= v;
          v *= friction;

          if (Math.abs(v) < 0.2) {
            if (scrollRef.current) scrollRef.current.classList.remove('is-dragging');
            return;
          }
        }

        animFrameId.current = requestAnimationFrame(step);
      };

      animFrameId.current = requestAnimationFrame(step);
    }
  };

  const handleClickCapture = (e) => {
    if (isDragging.current) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  return (
    <section className="home-section">
      <div className="section-header">
        <div className="section-title-group">
          {onTitleClick ? (
            <div
              className="section-title-wrapper clickable"
              onClick={onTitleClick}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onTitleClick();
                }
              }}
              title={`${title} 상세 보기 (사이드바 전환)`}
            >
              <h3 className="section-title">{title}</h3>
            </div>
          ) : (
            <h3 className="section-title">{title}</h3>
          )}
          {actions}
        </div>
        <div className="scroll-arrows">
          <button className="arrow-btn" onClick={() => scroll(-1)} aria-label="이전">
            <ChevronLeft size={18} />
          </button>
          <button className="arrow-btn" onClick={() => scroll(1)} aria-label="다음">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <div 
        className="h-scroll-row" 
        ref={scrollRef}
        onMouseDown={handleMouseDown}
        onMouseLeave={handleMouseLeaveOrUp}
        onMouseUp={handleMouseLeaveOrUp}
        onMouseMove={handleMouseMove}
        onClickCapture={handleClickCapture}
      >
        <div className="h-scroll-track" ref={trackRef}>
          {children}
        </div>
      </div>
    </section>
  );
}
