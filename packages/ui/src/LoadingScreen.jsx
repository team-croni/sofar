import React from 'react';
import Logo from './Logo';
import './LoadingScreen.css';

export default function LoadingScreen({ 
  message = '', 
  fullScreen = true, 
  size = 'md',
  className = ''
}) {
  const iconSizes = { sm: 24, md: 36, lg: 48 };
  const titleSizes = { sm: '1.25rem', md: '1.75rem', lg: '2.2rem' };

  return (
    <div className={`sofar-loading-screen ${fullScreen ? 'full-screen' : 'inline'} ${className}`}>
      <div className="sofar-loading-content">
        <Logo 
          iconSize={iconSizes[size] || 36} 
          titleSize={titleSizes[size] || '1.75rem'} 
          className="sofar-loading-logo" 
        />
        <div className="sofar-loading-indicator">
          <span className="sofar-loading-pulse-ring" />
        </div>
        {message && <p className="sofar-loading-message">{message}</p>}
      </div>
    </div>
  );
}
