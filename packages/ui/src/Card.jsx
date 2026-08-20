import React from 'react';

export default function Card({ children, className = '', style = {}, ...props }) {
  const cardStyle = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-cozy)',
    borderRadius: '16px',
    padding: '1.25rem',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    ...style,
  };

  return (
    <div style={cardStyle} className={className} {...props}>
      {children}
    </div>
  );
}
