import { Card, Logo } from '../ui';
import './MobileNoticeScreen.css';

export default function MobileNoticeScreen() {
  return (
    <div 
      className="mobile-notice-overlay"
      aria-label="모바일 환경 안내"
    >
      <div className="mobile-notice-backdrop" />
      
      <Card className="mobile-notice-card">
        {/* 상단 브랜드 로고 (이동 방지) */}
        <div className="mobile-notice-brand">
          <Logo iconSize={32} titleSize="2.25rem" onClick={(e) => e.preventDefault()} />
        </div>

        {/* 텍스트 영역 */}
        <div className="mobile-notice-content">
          <h2 className="mobile-notice-title">
            모바일 화면은 준비 중입니다
          </h2>
          <p className="mobile-notice-desc">
            sofar는 현재 PC 환경에 최적화되어 있습니다.<br />
            PC 브라우저에서 접속해 주세요.
          </p>
        </div>
      </Card>
    </div>
  );
}
