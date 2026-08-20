import React, { useRef, useState, useEffect } from 'react';
import './TrackTitleMarquee.css';

export default function TrackTitleMarquee({ title, isActive }) {
  const containerRef = useRef(null);
  const textRef = useRef(null);
  const titleInnerRef = useRef(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const checkOverflow = () => {
      if (containerRef.current && titleInnerRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        const textWidth = titleInnerRef.current.offsetWidth;
        setIsOverflowing(textWidth > containerWidth);
      }
    };
    checkOverflow();
    
    window.addEventListener('resize', checkOverflow);
    const timer = setTimeout(checkOverflow, 250);
    
    return () => {
      window.removeEventListener('resize', checkOverflow);
      clearTimeout(timer);
    };
  }, [title]);

  return (
    <div 
      ref={containerRef}
      className={`track-meta-title-container ${isOverflowing ? 'has-marquee' : ''}`}
    >
      <div 
        ref={textRef}
        className={`track-meta-title-scroll ${isActive ? 'animate-marquee' : ''}`}
      >
        <span ref={titleInnerRef}>{title}</span>
        {isOverflowing && (
          <span className="marquee-duplicate">{title}</span>
        )}
      </div>
    </div>
  );
}
