import React from 'react';
import { Ban, Snowflake, CloudRain, Flower2, Bug, Disc3 } from 'lucide-react';
import ParticleEffect from '../nowplaying/ParticleEffect';
import ImageSearchPicker from '../common/ImageSearchPicker';
import { Checkbox } from '../ui';
import {
  BACKGROUND_MAX_BLUR_PX,
  backgroundFilter,
  THEME_BACKGROUND_PRESETS,
  THEME_EFFECTS,
  THEME_INTENSITIES,
} from '../../utils/nowPlayingTheme';

// 배경 이미지 검색 키워드 (한국어 라벨 → 영어 검색어)
const THEME_SEARCH_KEYWORDS = [
  { label: '밤 도시', query: 'city night' },
  { label: '비 오는 창가', query: 'rain window' },
  { label: '눈 내리는 숲', query: 'snow forest' },
  { label: '밤하늘', query: 'night sky stars' },
  { label: '카페', query: 'cafe interior' },
  { label: '바다', query: 'ocean waves' },
  { label: '노을', query: 'sunset' },
  { label: '벚꽃', query: 'cherry blossom' },
];

const EFFECT_ICONS = {
  none: <Ban size={18} strokeWidth={1.6} />,
  snow: <Snowflake size={18} strokeWidth={1.6} />,
  rain: <CloudRain size={18} strokeWidth={1.6} />,
  sakura: <Flower2 size={18} strokeWidth={1.6} />,
  fireflies: <Bug size={18} strokeWidth={1.6} />,
};

const cssUrl = (url) => `url("${url.replace(/"/g, '%22')}")`;

// 미리보기는 실제 화면보다 훨씬 작아서 흐림도 비율에 맞춰 줄임
const PREVIEW_BLUR_SCALE = 0.2;

// 볼륨 슬라이더와 같은 방식으로 채워진 구간을 표시
const rangeFillStyle = (value, max, disabled = false) => {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const fill = disabled ? 'rgba(255, 255, 255, 0.22)' : 'var(--primary-warm)';
  return {
    background: `linear-gradient(to right, ${fill} 0%, ${fill} ${pct}%, rgba(255, 255, 255, 0.08) ${pct}%, rgba(255, 255, 255, 0.08) 100%)`,
  };
};

/**
 * Now Playing 화면 축소 미리보기 (배경 + 어둡기 + 효과 + LP)
 */
export function NowPlayingThemePreview({ theme, coverUrl = '', title = '' }) {
  const hasBackground = Boolean(theme.background);
  return (
    <div className="np-preview">
      {/* 배경 미지정 시 실제 화면처럼 앨범 커버를 흐리게 깔아서 보여줌 */}
      <div
        className={`np-preview-bg ${hasBackground ? '' : 'is-default'} ${!hasBackground && coverUrl ? 'has-cover' : ''}`}
        style={
          hasBackground
            ? {
                backgroundImage: cssUrl(theme.background),
                filter: backgroundFilter(theme.blur * BACKGROUND_MAX_BLUR_PX * PREVIEW_BLUR_SCALE, theme.grayscale),
                transform: theme.blur > 0 ? 'scale(1.08)' : undefined,
              }
            : coverUrl
              ? { backgroundImage: cssUrl(coverUrl) }
              : undefined
        }
      />
      {hasBackground && <div className="np-preview-dim" style={{ opacity: theme.dim }} />}
      {/* 기본(앨범 커버) 배경은 항상 비네트가 있고, 직접 고른 배경은 설정에 따름 */}
      {(!hasBackground || theme.vignette) && <div className="np-vignette np-preview-vignette" />}
      {theme.grain && <div className="np-preview-grain"><div className="np-grain" /></div>}
      <ParticleEffect effect={theme.effect} intensity={theme.intensity} />

      {/* 가운데: 자켓 + LP + 곡 정보 자리 */}
      <div className="np-preview-stage">
        <div className="np-preview-record">
          <div className="np-preview-disc" />
          <div
            className="np-preview-jacket"
            style={coverUrl ? { backgroundImage: cssUrl(coverUrl) } : undefined}
          />
        </div>
        <span className="np-preview-song">{title.trim() || '재생 중인 곡'}</span>
        <span className="np-preview-artist">아티스트</span>
      </div>
    </div>
  );
}

/**
 * "Now Playing 커스텀" 설정 영역 (배경 이미지 / 흐림 / 어둡기 / 배경 효과 / 날씨 효과 / 효과 양)
 */
export function NowPlayingThemeControls({ theme, onChange }) {
  const update = (patch) => onChange({ ...theme, ...patch });
  const hasBackground = Boolean(theme.background);
  const hasEffect = theme.effect !== 'none';

  return (
    <>
      <section className="pe-section">
        <div className="pe-section-head">
          <span className="pe-section-title">배경 이미지</span>
          <span className="pe-section-desc">선택하지 않으면 재생 중인 곡의 앨범 커버가 흐리게 표시됩니다.</span>
        </div>
        <ImageSearchPicker
          value={theme.background}
          onChange={(url) => update({ background: url })}
          presets={THEME_BACKGROUND_PRESETS}
          keywords={THEME_SEARCH_KEYWORDS}
          aspect="wide"
          emptyLabel="앨범 커버"
          emptyIcon={<Disc3 size={16} />}
        />
      </section>

      <section className={`pe-section ${hasBackground ? '' : 'is-disabled'}`}>
        <div className="pe-section-head">
          <label className="pe-section-title" htmlFor="pe-blur-range">
            배경 흐림
          </label>
          <span className="pe-section-value">{Math.round(theme.blur * 100)}%</span>
        </div>
        <input
          id="pe-blur-range"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={theme.blur}
          disabled={!hasBackground}
          onChange={(e) => update({ blur: parseFloat(e.target.value) })}
          className="pe-range"
          style={rangeFillStyle(theme.blur, 1, !hasBackground)}
        />
        <span className="pe-section-desc">
          {hasBackground ? '배경을 흐리게 해서 LP와 가사에 시선이 모이도록 합니다.' : '배경 이미지를 선택하면 조절할 수 있습니다.'}
        </span>
      </section>

      <section className={`pe-section ${hasBackground ? '' : 'is-disabled'}`}>
        <div className="pe-section-head">
          <label className="pe-section-title" htmlFor="pe-dim-range">
            배경 어둡기
          </label>
          <span className="pe-section-value">{Math.round(theme.dim * 100)}%</span>
        </div>
        <input
          id="pe-dim-range"
          type="range"
          min="0"
          max="0.8"
          step="0.05"
          value={theme.dim}
          disabled={!hasBackground}
          onChange={(e) => update({ dim: parseFloat(e.target.value) })}
          className="pe-range"
          style={rangeFillStyle(theme.dim, 0.8, !hasBackground)}
        />
        <span className="pe-section-desc">
          {hasBackground ? '가사와 곡 제목이 잘 보이도록 배경을 어둡게 합니다.' : '배경 이미지를 선택하면 조절할 수 있습니다.'}
        </span>
      </section>

      <section className="pe-section">
        <div className="pe-section-head">
          <span className="pe-section-title">배경 효과</span>
          {!hasBackground && (
            <span className="pe-section-desc">비네트와 흑백은 배경 이미지를 선택하면 사용할 수 있습니다.</span>
          )}
        </div>
        <div className="pe-toggle-list">
          <div className={`pe-toggle-row ${hasBackground ? '' : 'is-disabled'}`}>
            <Checkbox
              id="pe-vignette-checkbox"
              label="비네트"
              checked={theme.vignette}
              disabled={!hasBackground}
              onChange={(e) => update({ vignette: e.target.checked })}
            />
            <span className="pe-toggle-desc">가장자리를 어둡게 해 가운데로 시선을 모읍니다.</span>
          </div>
          <div className={`pe-toggle-row ${hasBackground ? '' : 'is-disabled'}`}>
            <Checkbox
              id="pe-grayscale-checkbox"
              label="흑백"
              checked={theme.grayscale}
              disabled={!hasBackground}
              onChange={(e) => update({ grayscale: e.target.checked })}
            />
            <span className="pe-toggle-desc">배경을 흑백으로 바꿔 차분한 분위기를 냅니다.</span>
          </div>
          <div className="pe-toggle-row">
            <Checkbox
              id="pe-grain-checkbox"
              label="필름 질감"
              checked={theme.grain}
              onChange={(e) => update({ grain: e.target.checked })}
            />
            <span className="pe-toggle-desc">잔잔한 노이즈로 오래된 필름 같은 분위기를 냅니다.</span>
          </div>
        </div>
      </section>

      <section className="pe-section">
        <span className="pe-section-title">날씨 효과</span>
        <div className="pe-effect-grid" role="radiogroup" aria-label="날씨 효과">
          {THEME_EFFECTS.map((item) => (
            <button
              key={item.value}
              type="button"
              role="radio"
              aria-checked={theme.effect === item.value}
              className={`pe-effect-card ${theme.effect === item.value ? 'active' : ''}`}
              onClick={() => update({ effect: item.value })}
            >
              {EFFECT_ICONS[item.value]}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className={`pe-section ${hasEffect ? '' : 'is-disabled'}`}>
        <span className="pe-section-title">효과 양</span>
        <div className="pe-segmented" role="radiogroup" aria-label="효과 양">
          {THEME_INTENSITIES.map((item) => (
            <button
              key={item.value}
              type="button"
              role="radio"
              aria-checked={theme.intensity === item.value}
              disabled={!hasEffect}
              className={`pe-segment ${theme.intensity === item.value ? 'active' : ''}`}
              onClick={() => update({ intensity: item.value })}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
