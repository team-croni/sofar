import React from 'react';
import { useHomePanel } from '../../hooks/useHomePanel';

import HomeSpinner from './HomeSpinner';
import TrendingSection from './TrendingSection';
import RecommendedPlaylistsSection from './RecommendedPlaylistsSection';
import PopularChartSection from './PopularChartSection';
import HomeFooter from './HomeFooter';

import './HomePanel.css';

export default function HomePanel() {
  const {
    feedLoading,
    topTracks,
    statTracks,
  } = useHomePanel();

  if (feedLoading) return <HomeSpinner />;

  return (
    <div className="home-panel-container scrollbar-none">
      {topTracks?.length > 0 && <TrendingSection />}
      <div className={`home-bottom-layout ${statTracks?.length > 0 ? 'has-popular' : ''}`}>
        <RecommendedPlaylistsSection />
        {statTracks?.length > 0 && <PopularChartSection />}
      </div>
      <HomeFooter />
    </div>
  );
}
