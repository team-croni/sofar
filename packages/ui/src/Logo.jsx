import React from 'react';
import { useNavigate } from 'react-router-dom';
import sofarLogo from '@sofar/assets/sofar-logo.svg';
import './Logo.css';

export default function Logo({ className = '', iconSize = 22, showSubtitle = false, titleSize = '1.25rem', onClick }) {
  let navigate;
  try {
    navigate = useNavigate();
  } catch (e) {
    navigate = null;
  }

  const handleClick = (e) => {
    if (onClick) {
      onClick(e);
    } else if (navigate) {
      navigate('/');
    }
  };

  return (
    <div 
      className={`sofar-brand-logo ${className}`} 
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick(e);
        }
      }}
    >
      <img src={sofarLogo} alt="Sofar Logo" className="sofar-logo-icon" style={{ width: iconSize, height: iconSize }} />
      <div className="sofar-logo-text">
        <h1 className="sofar-logo-name" style={{ fontSize: titleSize }}><span>so</span>far</h1>
      </div>
    </div>
  );
}
