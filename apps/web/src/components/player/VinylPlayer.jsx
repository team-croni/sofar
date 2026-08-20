import React, { useState, useEffect } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { useAudio } from '../../contexts/AudioContext';
import { thumbnailCache } from '../../utils/thumbnailCache';
import { formatArtistName } from '../../utils/trackUtils';
import sofarLogo from '@sofar/assets/sofar-logo.svg';
import './VinylPlayer.css';

export default function VinylPlayer() {
  const { 
    isPlaying, 
    currentTrack, 
    showVideoInVinyl, 
    setShowVideoInVinyl,
    videoVinylState, 
    setVideoVinylState, 
    togglePlay,
    reportMatchFeedback
  } = useAudio();
  const [imgFallbackLevel, setImgFallbackLevel] = useState(0); // 0: maxres, 1: hq, 2: default/unsplash
  const [itunesThumbnailUrl, setItunesThumbnailUrl] = useState(null);

  // LP판 슬라이드 전환을 위한 상태값
  const [vinylTrack, setVinylTrack] = useState(null);
  const [vinylImgUrl, setVinylImgUrl] = useState('');
  const [isTransitioning, setIsTransitioning] = useState(false);

  const handleVinylClick = () => {
    if (showVideoInVinyl || videoVinylState === 'slipping-in' || videoVinylState === 'video') return;
    
    setVideoVinylState('slipping-in');
    
    if (!isPlaying && togglePlay) {
      togglePlay();
    }

    setTimeout(() => {
      setShowVideoInVinyl(true);
      setVideoVinylState('video');
    }, 450);
  };

  // 앨범 이미지 URL을 구하는 공통 헬퍼
  const getTrackThumbnail = (track, itunesUrl) => {
    if (itunesUrl && track?.id === currentTrack?.id) {
      return itunesUrl;
    }
    // 캐시 확인
    if (track) {
      const cached = thumbnailCache.get(track.custom_artist, track.custom_title);
      if (cached) return cached;
    }
    if (track?.youtube_video_id) {
      return `https://img.youtube.com/vi/${track.youtube_video_id}/hqdefault.jpg`;
    }
    return 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=400&h=400&q=80';
  };

  // 재생 곡이 변경될 때 썸네일 레벨 리셋 및 iTunes 썸네일 조회
  useEffect(() => {
    setImgFallbackLevel(0);
    setItunesThumbnailUrl(null);

    if (!currentTrack || !currentTrack.custom_title) {
      return;
    }

    // 캐시 확인
    const cachedUrl = thumbnailCache.get(currentTrack.custom_artist, currentTrack.custom_title);
    if (cachedUrl) {
      setItunesThumbnailUrl(cachedUrl);
      return;
    }

    let active = true;
    const fetchItunesThumbnail = async () => {
      try {
        // 1. Supabase 공용 가사 캐시에서 이미 백업된 앨범 자켓 정보가 있는지 먼저 확인
        try {
          const { supabase } = await import('../../contexts/AuthContext');
          if (supabase) {
            const { data, error } = await supabase
              .from('lyric_caches')
              .select('raw_lrc')
              .eq('artist', currentTrack.custom_artist?.trim() || '')
              .eq('title', currentTrack.custom_title?.trim() || '')
              .maybeSingle();

            if (!error && data && data.raw_lrc && active) {
              const artworkMatch = data.raw_lrc.match(/^\[artwork:(https?:\/\/[^\]]+)\]/);
              if (artworkMatch) {
                const artworkUrl = artworkMatch[1];
                thumbnailCache.set(currentTrack.custom_artist, currentTrack.custom_title, artworkUrl);
                setItunesThumbnailUrl(artworkUrl);
                return;
              }
            }
          }
        } catch (dbErr) {
          console.warn('Failed to query album art from DB:', dbErr);
        }

        // 2. 캐시에도 없고 DB 백업본도 없는 경우에만 iTunes API 요청 진행
        const query = `${currentTrack.custom_title} ${currentTrack.custom_artist || ''}`.trim();
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=1&country=kr`;
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          if (active && data.results && data.results.length > 0) {
            const artworkUrl = data.results[0].artworkUrl100;
            if (artworkUrl) {
              const highResArtwork = artworkUrl.replace(/\/[0-9]+x[0-9]+/, '/600x600');
              thumbnailCache.set(currentTrack.custom_artist, currentTrack.custom_title, highResArtwork);
              setItunesThumbnailUrl(highResArtwork);
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch iTunes thumbnail:', err);
      }
    };

    fetchItunesThumbnail();

    return () => {
      active = false;
    };
  }, [currentTrack]);

  // 곡 전환 시 LP판 물리 연출
  useEffect(() => {
    if (!currentTrack) {
      setVinylTrack(null);
      setVinylImgUrl('');
      return;
    }

    if (!vinylTrack) {
      setVinylTrack(currentTrack);
      setVinylImgUrl(getTrackThumbnail(currentTrack, itunesThumbnailUrl));
      return;
    }

    if (currentTrack.id !== vinylTrack.id) {
      setIsTransitioning(true);
      
      const timer = setTimeout(() => {
        setVinylTrack(currentTrack);
        setVinylImgUrl(getTrackThumbnail(currentTrack, itunesThumbnailUrl));
        
        const slideOutTimer = setTimeout(() => {
          setIsTransitioning(false);
        }, 50);
        
        return () => clearTimeout(slideOutTimer);
      }, 250);

      return () => clearTimeout(timer);
    } else {
      setVinylImgUrl(getTrackThumbnail(currentTrack, itunesThumbnailUrl));
    }
  }, [currentTrack, itunesThumbnailUrl, vinylTrack]);

  const getThumbnailUrl = () => {
    if (itunesThumbnailUrl) {
      return itunesThumbnailUrl;
    }
    if (currentTrack?.youtube_video_id) {
      if (imgFallbackLevel === 0) {
        return `https://img.youtube.com/vi/${currentTrack.youtube_video_id}/maxresdefault.jpg`;
      }
      if (imgFallbackLevel === 1) {
        return `https://img.youtube.com/vi/${currentTrack.youtube_video_id}/hqdefault.jpg`;
      }
    }
    return 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=400&h=400&q=80';
  };

  const handleImageError = () => {
    if (itunesThumbnailUrl) {
      setItunesThumbnailUrl(null);
    } else if (imgFallbackLevel < 2) {
      setImgFallbackLevel(prev => prev + 1);
    }
  };

  const handleImageLoad = (e) => {
    const img = e.target;
    if (!itunesThumbnailUrl && img.naturalWidth === 120 && img.naturalHeight === 90) {
      handleImageError();
    }
  };

  if (!currentTrack) {
    return (
      <div className="vinyl-player-card empty">
        <div 
          className="vinyl-container-wrapper"
          onMouseMove={(e) => {
            const wrapper = e.currentTarget;
            const container = wrapper.querySelector('.vinyl-container');
            if (!container) return;

            const rect = wrapper.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const xc = x / rect.width - 0.5;
            const yc = y / rect.height - 0.5;
            
            const maxRotate = 15;
            const rotX = -yc * maxRotate;
            const rotY = xc * maxRotate;
            
            const sheenX = -xc * 12;
            const sheenY = -yc * 12;
            
            container.style.setProperty('--rotate-x', `${rotX}deg`);
            container.style.setProperty('--rotate-y', `${rotY}deg`);
            container.style.setProperty('--sheen-x', `${sheenX}px`);
            container.style.setProperty('--sheen-y', `${sheenY}px`);
          }}
          onMouseLeave={(e) => {
            const wrapper = e.currentTarget;
            const container = wrapper.querySelector('.vinyl-container');
            if (!container) return;

            container.style.removeProperty('--rotate-x');
            container.style.removeProperty('--rotate-y');
            container.style.removeProperty('--sheen-x');
            container.style.removeProperty('--sheen-y');
          }}
        >
          <div className="vinyl-container">
            <div className="album-jacket empty-jacket">
              <div className="empty-jacket-placeholder">
                <img src={sofarLogo} alt="sofar" className="empty-jacket-logo" />
              </div>
            </div>
          </div>
        </div>
        <div className="track-info">
          <h2 className="track-title">재생 중인 곡 없음</h2>
          <p className="track-artist">재생할 곡을 선택해주세요</p>
        </div>
      </div>
    );
  }

  return (
    <div className="vinyl-player-card">
      {/* 앨범 커버 (자켓 & LP판 디자인) */}
      <div 
        className={`vinyl-container-wrapper ${videoVinylState === 'video' ? 'video-active' : ''} ${
          videoVinylState === 'slipping-in' || videoVinylState === 'video' || videoVinylState === 'hiding-video' ? 'slipping-in' : ''
        }`}
        onClick={handleVinylClick}
        onMouseMove={(e) => {
          if (showVideoInVinyl) return;
          const wrapper = e.currentTarget;
          const container = wrapper.querySelector('.vinyl-container');
          if (!container) return;

          const rect = wrapper.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          const xc = x / rect.width - 0.5;
          const yc = y / rect.height - 0.5;
          
          const maxRotate = 15; // 최대 15도 회전
          const rotX = -yc * maxRotate;
          const rotY = xc * maxRotate;
          
          const sheenX = -xc * 12;
          const sheenY = -yc * 12;
          
          container.style.setProperty('--rotate-x', `${rotX}deg`);
          container.style.setProperty('--rotate-y', `${rotY}deg`);
          container.style.setProperty('--sheen-x', `${sheenX}px`);
          container.style.setProperty('--sheen-y', `${sheenY}px`);
        }}
        onMouseLeave={(e) => {
          const wrapper = e.currentTarget;
          const container = wrapper.querySelector('.vinyl-container');
          if (!container) return;

          container.style.removeProperty('--rotate-x');
          container.style.removeProperty('--rotate-y');
          container.style.removeProperty('--sheen-x');
          container.style.removeProperty('--sheen-y');
        }}
      >
        <div className="vinyl-container">
        {/* 사각형 앨범 자켓 */}
        <div className="album-jacket">
          <img 
            key={getThumbnailUrl()}
            src={getThumbnailUrl()} 
            onLoad={handleImageLoad} 
            onError={handleImageError} 
            alt="Album Cover" 
            className="jacket-img fade-in-image"
          />
          <div className="jacket-shadow"></div>
        </div>

        {/* LP판 컨테이너 */}
        {(() => {
          const isHiddenInJacket = !currentTrack || isTransitioning || (videoVinylState !== 'idle' && videoVinylState !== 'vinyl');
          return (
            <div className={`vinyl-record-disc ${isHiddenInJacket ? 'transition-in' : ''}`}>
              {/* 실제로 회전하는 LP판 바디 */}
              <div className={`vinyl-record-body animate-spin-slow ${isPlaying ? '' : 'animate-spin-paused'}`}>
                <div className="vinyl-grooves"></div>
                {/* LP판 중심 라벨 (곡 이미지) */}
                <div className="vinyl-label">
                  <img 
                    src={vinylImgUrl} 
                    alt="LP Center Label" 
                    className="vinyl-label-img"
                  />
                </div>
                <div className="vinyl-center-hole">
                  <div className="vinyl-center-pin"></div>
                </div>
              </div>
              {/* 정지 상태로 빛 반사만 물리적으로 표현하는 정적 레이어 */}
              <div className="vinyl-sheen-wrapper">
                <div className="vinyl-sheen-overlay"></div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>

      {/* 곡 메타데이터 */}
      <div className="track-info">
        <h2 className="track-title">
          {currentTrack.custom_title || '제목 없음'}
        </h2>
        <p className="track-artist">
          {formatArtistName(currentTrack.custom_artist) || '아티스트 없음'}
        </p>
      </div>
    </div>
  );
}
