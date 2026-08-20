import React from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../ui';
import './HomeFooter.css';

const CONTACT_EMAIL = import.meta.env.VITE_CONTACT_EMAIL || 'support@croni.com';

export default function HomeFooter() {
  return (
    <footer className="home-footer">
      <div className="home-footer-divider" />
      <div className="home-footer-content">
        <div className="home-footer-brand">
          <Logo iconSize={17} titleSize="1.05rem" className="home-footer-brand-logo" />
          <span className="home-footer-copyright">© 2026 Croni. All rights reserved.</span>
        </div>
        <div className="home-footer-links">
          <Link to="/terms" target="_blank" rel="noreferrer" className="home-footer-link">
            이용약관
          </Link>
          <span className="home-footer-dot">·</span>
          <Link to="/privacy" target="_blank" rel="noreferrer" className="home-footer-link">
            개인정보처리방침
          </Link>
          <span className="home-footer-dot">·</span>
          <a href={`mailto:${CONTACT_EMAIL}`} className="home-footer-link">
            문의하기
          </a>
        </div>
      </div>
    </footer>
  );
}
