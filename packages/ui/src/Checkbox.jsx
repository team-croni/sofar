import React from 'react';
import { Check } from 'lucide-react';
import './Checkbox.css';

export default function Checkbox({
  id,
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
      className={`sofar-checkbox-wrapper ${checked ? 'is-checked' : ''} ${disabled ? 'is-disabled' : ''} ${className}`}
      style={style}
    >
      <div className="sofar-checkbox-box">
        <input
          type="checkbox"
          id={id}
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          className="sofar-checkbox-input"
          {...props}
        />
        <div className="sofar-checkbox-custom">
          <Check size={13} strokeWidth={3} className="sofar-checkbox-icon" />
        </div>
      </div>
      {label && <span className="sofar-checkbox-label">{label}</span>}
    </label>
  );
}
