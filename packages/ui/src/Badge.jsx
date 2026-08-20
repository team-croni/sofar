import React from 'react';

export default function Badge({ children, variant = 'secondary', className = '', style = {}, ...props }) {
  const badgeStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0.2rem 0.55rem',
    borderRadius: '999px',
    fontSize: '11px',
    fontWeight: '400',
    background: variant === 'primary' ? 'rgba(212, 163, 115, 0.15)' : 'rgba(255, 255, 255, 0.06)',
    color: variant === 'primary' ? 'var(--primary-warm)' : 'var(--text-secondary)',
    border: variant === 'primary' ? '1px solid rgba(212, 163, 115, 0.3)' : '1px solid var(--border-cozy)',
    ...style,
  };

  return (
    <span style={badgeStyle} className={className} {...props}>
      {children}
    </span>
  );
}
