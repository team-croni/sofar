import React from 'react';
import './Radio.css';

export default function Radio({
  id,
  name,
  value,
  label,
  checked = false,
  onChange,
  disabled = false,
  className = '',
  style = {},
  ...props
}) {
  return (
    <label
      htmlFor={id}
      className={`sofar-radio-wrapper ${checked ? 'is-checked' : ''} ${disabled ? 'is-disabled' : ''} ${className}`}
      style={style}
    >
      <div className="sofar-radio-box">
        <input
          type="radio"
          id={id}
          name={name}
          value={value}
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          className="sofar-radio-input"
          {...props}
        />
        <div className="sofar-radio-custom">
          <span className="sofar-radio-dot" />
        </div>
      </div>
      {label && <span className="sofar-radio-label">{label}</span>}
    </label>
  );
}
