import sofarLogo from '@sofar/assets/sofar-logo.svg';
import { vinylBackground } from '../../utils/vinylColor';
import './VinylFallback.css';

/**
 * 앨범 이미지가 없을 때 보여 주는 LP판 (Now Playing 화면의 LP판과 같은 질감)
 * 크기는 부모 요소를 꽉 채우며, spinning이면 천천히 돈다.
 * @param {string} seed - 배경색을 정하는 값 (보통 "아티스트|곡명")
 */
export default function VinylFallback({ spinning = false, seed = '' }) {
  const bg = vinylBackground(seed);
  const style = bg ? { '--vinyl-bg': bg } : undefined;
  return (
    <div className="vinyl-fallback" style={style} aria-hidden="true">
      <div className={`vinyl-fallback__disc ${spinning ? 'is-spinning' : ''}`}>
        <div className="vinyl-fallback__grooves" />
        <div className="vinyl-fallback__label">
          <img src={sofarLogo} alt="" className="vinyl-fallback__logo" draggable={false} />
        </div>
        <div className="vinyl-fallback__hole" />
        <div className="vinyl-fallback__sheen" />
      </div>
    </div>
  );
}
