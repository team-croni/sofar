import React from 'react';
import './Button.css';

export default function Button({
  children,
  className = '',
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  leadingIcon = null,
  trailingIcon = null,
  type = 'button',
  ...props
}) {
  const isDisabled = disabled || loading;
  const isIconOnly = variant === 'icon' || (!children && (leadingIcon || trailingIcon));

  return (
    <button
      type={type}
      disabled={isDisabled}
      className={`sofar-btn btn-${variant} btn-${size} ${isIconOnly ? 'icon-btn' : ''} ${loading ? 'btn-loading' : ''} ${className}`}
      {...props}
    >
      {loading && <span className="btn-spinner" />}
      {!loading && leadingIcon && <span className="btn-leading-icon">{leadingIcon}</span>}
      {children && <span className="btn-content">{children}</span>}
      {!loading && trailingIcon && <span className="btn-trailing-icon">{trailingIcon}</span>}
    </button>
  );
}
