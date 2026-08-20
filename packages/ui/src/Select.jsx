import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import './Select.css';

export default function Select({
  id,
  size = 'md',
  label,
  value,
  onChange,
  options = [],
  placeholder = '선택하세요',
  disabled = false,
  error,
  helperText,
  className = '',
  style = {},
  children,
  ...props
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // children(option 태그들)이 넘어온 경우 options 배열로 정규화
  const normalizedOptions = React.useMemo(() => {
    if (options && options.length > 0) {
      return options;
    }
    if (children) {
      return React.Children.toArray(children)
        .filter((child) => React.isValidElement(child) && child.type === 'option')
        .map((child) => ({
          value: child.props.value,
          label: child.props.children,
          disabled: child.props.disabled,
        }));
    }
    return [];
  }, [options, children]);

  // 현재 선택된 옵션 라벨 찾기
  const selectedOption = normalizedOptions.find((opt) => String(opt.value) === String(value));
  const displayLabel = selectedOption ? selectedOption.label : placeholder;

  // 바깥 클릭 및 외부 스크롤 시 드롭다운 닫기
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };

    const handleScroll = (e) => {
      if (containerRef.current && containerRef.current.contains(e.target)) {
        return;
      }
      setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('scroll', handleScroll, true);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen]);

  // 옵션 선택 처리 (기존 onChange({ target: { value } }) 인터페이스 100% 호환)
  const handleSelect = (optionValue) => {
    if (disabled) return;
    if (onChange) {
      onChange({
        target: {
          value: optionValue,
          name: props.name || id,
        },
      });
    }
    setIsOpen(false);
  };

  // 키보드 조작
  const handleKeyDown = (e) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setIsOpen((prev) => !prev);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`sofar-select-wrapper select-${size} ${error ? 'has-error' : ''} ${disabled ? 'is-disabled' : ''} ${isOpen ? 'is-open' : ''} ${className}`}
      style={style}
    >
      {label && (
        <label htmlFor={id} className="sofar-select-label">
          {label}
        </label>
      )}

      <div className="sofar-select-container">
        {/* Custom Trigger Button */}
        <button
          type="button"
          id={id}
          disabled={disabled}
          className={`sofar-select-field sofar-select-trigger ${!selectedOption ? 'is-placeholder' : ''}`}
          onClick={() => !disabled && setIsOpen((prev) => !prev)}
          onKeyDown={handleKeyDown}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          {...props}
        >
          <span className="sofar-select-value-text">{displayLabel}</span>
          <span className={`sofar-select-arrow ${isOpen ? 'is-open' : ''}`}>
            <ChevronDown size={14} />
          </span>
        </button>

        {/* Custom Dropdown Popover Menu */}
        {isOpen && !disabled && (
          <div className="sofar-select-dropdown" role="listbox">
            <div className="sofar-select-options-list">
              {normalizedOptions.map((opt) => {
                const isSelected = String(opt.value) === String(value);
                return (
                  <div
                    key={opt.value}
                    role="option"
                    aria-selected={isSelected}
                    className={`sofar-select-option ${isSelected ? 'is-selected' : ''} ${opt.disabled ? 'is-disabled' : ''}`}
                    onClick={() => !opt.disabled && handleSelect(opt.value)}
                  >
                    <span className="sofar-select-option-label">{opt.label}</span>
                    {isSelected && (
                      <span className="sofar-select-check-icon">
                        <Check size={14} />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {(error || helperText) && (
        <p className={`sofar-select-message ${error ? 'error-text' : 'helper-text'}`}>
          {error || helperText}
        </p>
      )}
    </div>
  );
}
