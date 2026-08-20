import React from 'react';
import './Input.css';

export default function Input({
  id,
  type = 'text',
  size = 'md',
  label,
  placeholder,
  value,
  onChange,
  autoComplete,
  disabled = false,
  error,
  helperText,
  leadingIcon,
  trailingIcon,
  className = '',
  style = {},
  ...props
}) {
  return (
    <div className={`sofar-input-wrapper input-${size} ${error ? 'has-error' : ''} ${disabled ? 'is-disabled' : ''} ${className}`} style={style}>
      {label && (
        <label htmlFor={id} className="sofar-input-label">
          {label}
        </label>
      )}
      <div className="sofar-input-container">
        {leadingIcon && <span className="sofar-input-icon leading">{leadingIcon}</span>}
        <input
          id={id}
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          disabled={disabled}
          className={`sofar-input-field ${leadingIcon ? 'has-leading' : ''} ${trailingIcon ? 'has-trailing' : ''}`}
          {...props}
        />
        {trailingIcon && <span className="sofar-input-icon trailing">{trailingIcon}</span>}
      </div>
      {(error || helperText) && (
        <p className={`sofar-input-message ${error ? 'error-text' : 'helper-text'}`}>
          {error || helperText}
        </p>
      )}
    </div>
  );
}
