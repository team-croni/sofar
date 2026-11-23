import React, { useEffect, useState } from 'react';
import { useHomePanel } from '../../hooks/useHomePanel';
import { useAudio } from '../../contexts/AudioContext';

import HomeSpinner from './HomeSpinner';
import TrendingSection from './TrendingSection';
import RecommendedPlaylistsSection from './RecommendedPlaylistsSection';
import PopularChartSection from './PopularChartSection';
import ForYouSection from './ForYouSection';
import HomeFooter from './HomeFooter';

import './HomePanel.css';

export default function HomePanel() {
  const {
    feedLoading,
    topTracks,
    statTracks,
  } = useHomePanel();
  const { currentTrack } = useAudio();
  const hasPlayer = Boolean(currentTrack);

  // 홈에 처음 들어온 직후에만 목록 아이템을 순서대로 띄운다.
  // (인기 순위는 3분마다 순위가 바뀌며 행이 다시 그려지므로, 그때마다 다시 움직이지 않게 막는다)
  const [isEntering, setIsEntering] = useState(true);
  useEffect(() => {
    if (feedLoading) return undefined;
    const timer = setTimeout(() => setIsEntering(false), 1200);
    return () => clearTimeout(timer);
  }, [feedLoading]);

  if (feedLoading) return <HomeSpinner />;

  return (
    <div className={`home-panel-container scrollbar-none ${hasPlayer ? 'has-player' : ''} ${isEntering ? 'is-entering' : ''}`}>
      {topTracks?.length > 0 && <TrendingSection />}
      <div className={`home-bottom-layout ${statTracks?.length > 0 ? 'has-popular' : ''}`}>
        <RecommendedPlaylistsSection />
        {statTracks?.length > 0 && <PopularChartSection />}
      </div>
      <ForYouSection />
      <HomeFooter />
    </div>
  );
}
