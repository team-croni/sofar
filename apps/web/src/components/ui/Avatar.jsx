import React, { useState, useEffect } from 'react';
import './Avatar.css';

// 화사하고 선명한 3가지 색상 조합 그라디언트 테마 (Vibrant 3-Color Gradients)
const THREE_COLOR_GRADIENTS = [
  // 0: Vibrant Sunset (선명한 코랄 핑크 & 로즈 피치 & 웜 골드)
  'linear-gradient(135deg, #ff6b6b 0%, #ff8e53 50%, #feca57 100%)',
  // 1: Neon Violet & Rose (선명한 자줏빛 바이올렛 & 오키드 핑크 & 펄 퍼플)
  'linear-gradient(135deg, #ff007f 0%, #9c88ff 50%, #48dbfb 100%)',
  // 2: Tropical Amber (soFar 시그니처 웜 골드 & 코랄 오렌지 & 딥 마젠타)
  'linear-gradient(135deg, #d4a373 0%, #ff7675 50%, #fd79a8 100%)',
  // 3: Electric Ocean (선명한 에메랄드 민트 & 아쿠아 블루 & 인디고)
  'linear-gradient(135deg, #00f2fe 0%, #4facfe 50%, #6c5ce7 100%)'
];

function getGradientIndex(name = '') {
  if (!name) return 0;
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % THREE_COLOR_GRADIENTS.length;
}

export default function Avatar({
  src = null,
  name = '',
  size = 28,
  className = '',
  gradientIndex = null,
  ...props
}) {
  const [error, setError] = useState(false);

  useEffect(() => {
    setError(false);
  }, [src]);

  const idx = gradientIndex !== null ? gradientIndex : getGradientIndex(name);
  const avatarBackground = THREE_COLOR_GRADIENTS[idx];

  const containerStyle = {
    width: `${size}px`,
    height: `${size}px`
  };

  return (
    <div 
      className={`sofar-avatar ${className}`} 
      style={containerStyle}
      {...props}
    >
      {src && !error ? (
        <img
          src={src}
          alt={name}
          className="avatar-img"
          onError={() => setError(true)}
        />
      ) : (
        <div 
          className="avatar-fallback mesh-avatar"
          style={{ background: avatarBackground }}
        />
      )}
    </div>
  );
}
