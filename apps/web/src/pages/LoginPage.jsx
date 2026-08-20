import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';

import {
  ArrowLeft,
  MailCheck,
  RefreshCw,
  Eye,
  EyeOff,
  Mail,
  Lock,
  User,
  KeyRound,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Disc3,
  Mic2,
  ListMusic,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Button, Input, Logo } from '../components/ui';
import './LoginPage.css';

/* ── 로그인 화면 좌측 히어로 배경 이미지 (Unsplash 또는 원하는 이미지 URL로 손쉽게 교체 가능) ── */
const DEFAULT_HERO_IMAGE = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=1200&q=80';

/* ── Google Official Icon ─────────────────────────── */
const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <path
      d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
      fill="#4285F4"
    />
    <path
      d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
      fill="#34A853"
    />
    <path
      d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
      fill="#FBBC05"
    />
    <path
      d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
      fill="#EA4335"
    />
  </svg>
);

/* ── Panel Constants ────────────────────────────── */
const PANEL = { LOGIN: 'login', SIGNUP: 'signup', OTP: 'otp', RESET: 'reset' };
const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60;

export default function LoginPage({ heroImage = DEFAULT_HERO_IMAGE }) {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    user,
    loginWithGoogle,
    loginWithEmail,
    signUpWithEmail,
    resetPassword,
    verifyEmailOtp,
  } = useAuth();

  const params = new URLSearchParams(location.search);
  const initPanel = params.get('tab') === 'signup' ? PANEL.SIGNUP : PANEL.LOGIN;
  const redirectTo = params.get('redirect') || '/';

  const [panel, setPanel] = useState(initPanel);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // 폼 필드 상태
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [resetEmail, setResetEmail] = useState('');

  // 비밀번호 표시 토글
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  // OTP 상태
  const [otpValues, setOtpValues] = useState(Array(OTP_LENGTH).fill(''));
  const [resendCooldown, setResendCooldown] = useState(0);
  const otpRefs = useRef([]);
  const cooldownTimerRef = useRef(null);

  // 이미 로그인된 실제 계정인 경우 리다이렉트
  useEffect(() => {
    if (user && !user.isGuest) {
      navigate(redirectTo, { replace: true });
    }
  }, [user, navigate, redirectTo]);

  useEffect(() => () => clearInterval(cooldownTimerRef.current), []);

  const clearMessages = () => {
    setErrorMsg('');
    setSuccessMsg('');
  };

  const switchPanel = (next) => {
    clearMessages();
    setOtpValues(Array(OTP_LENGTH).fill(''));

    if (next === PANEL.RESET) {
      try {
        localStorage.removeItem('supabase.auth.token');
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.includes('auth-token')) {
            localStorage.removeItem(key);
          }
        }
      } catch (e) {}
    }

    setPanel(next);
  };

  const startCooldown = () => {
    setResendCooldown(RESEND_COOLDOWN);
    clearInterval(cooldownTimerRef.current);
    cooldownTimerRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    if (panel === PANEL.OTP) {
      setTimeout(() => otpRefs.current[0]?.focus(), 150);
    }
  }, [panel]);

  useEffect(() => {
    const code = otpValues.join('');
    if (code.length === OTP_LENGTH && panel === PANEL.OTP) {
      handleVerifyOtp(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otpValues]);

  /* ── Google 간편 로그인 ── */
  const handleGoogle = async () => {
    setLoading(true);
    clearMessages();
    const { error } = await loginWithGoogle();
    if (error) {
      setErrorMsg('구글 로그인 중 오류가 발생했습니다: ' + error.message);
      setLoading(false);
    }
  };

  /* ── 이메일 로그인 ── */
  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setErrorMsg('이메일과 비밀번호를 입력해 주세요.');
      return;
    }
    setLoading(true);
    clearMessages();
    const { error } = await loginWithEmail(email.trim(), password);
    setLoading(false);
    if (error) {
      setErrorMsg(
        error.message.includes('Invalid login credentials')
          ? '이메일 또는 비밀번호가 올바르지 않습니다.'
          : error.message.includes('Email not confirmed')
          ? '이메일 인증이 완료되지 않았습니다. 받은 편지함을 확인해 주세요.'
          : error.message,
      );
    }
  };

  /* ── 회원가입 ── */
  const handleSignUp = async (e) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setErrorMsg('이용하실 닉네임을 입력해 주세요.');
      return;
    }
    if (!email.trim() || !password) {
      setErrorMsg('이메일과 비밀번호를 입력해 주세요.');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('비밀번호는 6자 이상이어야 합니다.');
      return;
    }
    if (password !== confirmPw) {
      setErrorMsg('비밀번호 확인이 일치하지 않습니다.');
      return;
    }

    setLoading(true);
    clearMessages();
    const { error } = await signUpWithEmail(email.trim(), password, displayName.trim());
    setLoading(false);

    if (error) {
      setErrorMsg(
        error.message.includes('already registered') ||
          error.message.includes('User already registered')
          ? '이미 가입된 이메일 주소입니다.'
          : error.message,
      );
    } else {
      startCooldown();
      switchPanel(PANEL.OTP);
    }
  };

  /* ── OTP 재발송 ── */
  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setLoading(true);
    clearMessages();
    const { error } = await signUpWithEmail(email.trim(), password, displayName.trim());
    setLoading(false);
    if (error) {
      setErrorMsg('인증 코드 재발송 중 오류가 발생했습니다.');
    } else {
      startCooldown();
      setSuccessMsg('새로운 인증 코드를 발송했습니다.');
      setOtpValues(Array(OTP_LENGTH).fill(''));
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    }
  };

  /* ── OTP 입력 ── */
  const handleOtpChange = (index, value) => {
    if (value.length > 1) {
      const digits = value.replace(/\D/g, '').slice(0, OTP_LENGTH);
      const next = Array(OTP_LENGTH).fill('');
      digits.split('').forEach((d, i) => {
        next[i] = d;
      });
      setOtpValues(next);
      setTimeout(
        () => otpRefs.current[Math.min(digits.length, OTP_LENGTH - 1)]?.focus(),
        0,
      );
      return;
    }
    const digit = value.replace(/\D/g, '');
    const next = [...otpValues];
    next[index] = digit;
    setOtpValues(next);
    if (digit && index < OTP_LENGTH - 1) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpValues[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  /* ── OTP 검증 ── */
  const handleVerifyOtp = async (code) => {
    const token = code ?? otpValues.join('');
    if (token.length < OTP_LENGTH) {
      setErrorMsg('6자리 인증 코드를 모두 입력해 주세요.');
      return;
    }
    setLoading(true);
    clearMessages();
    const { error } = await verifyEmailOtp(email.trim(), token);
    setLoading(false);
    if (error) {
      setErrorMsg(
        error.message.includes('expired')
          ? '인증 코드가 만료되었습니다. 재발송 후 다시 시도해 주세요.'
          : error.message.includes('nvalid')
          ? '인증 코드가 올바르지 않습니다.'
          : error.message,
      );
      setOtpValues(Array(OTP_LENGTH).fill(''));
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
    }
  };

  /* ── 비밀번호 재설정 ── */
  const handleReset = async (e) => {
    e.preventDefault();
    if (!resetEmail.trim()) {
      setErrorMsg('가입하신 이메일 주소를 입력해 주세요.');
      return;
    }
    setLoading(true);
    clearMessages();
    const { error } = await resetPassword(resetEmail.trim());
    setLoading(false);
    if (error) {
      const msg = error.message || '';
      if (msg.includes('hook') || msg.includes('unexpected_failure')) {
        setErrorMsg('인증 서비스 설정(Auth Hook) 오류가 발생했습니다. 관리자 또는 Supabase 대시보드 설정을 확인해 주세요.');
      } else if (msg.includes('rate limit') || msg.includes('over_email_send_rate_limit')) {
        setErrorMsg('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');
      } else {
        setErrorMsg(msg || '비밀번호 재설정 링크 발송 중 오류가 발생했습니다.');
      }
    } else {
      setSuccessMsg('비밀번호 재설정 링크를 발송했습니다. 받은 편지함을 확인해 주세요.');
    }
  };

  return (
    <div className="login-page">
      {/* ── Layered Ambient Glow Backdrops ── */}
      <div className="login-ambient-glow glow-primary" aria-hidden="true" />
      <div className="login-ambient-glow glow-secondary" aria-hidden="true" />

      <div className="login-split-layout">
        {/* ══════════════════════════════════════════════════════
            LEFT SHOWCASE (Brand Hero & Visual Stage)
           ══════════════════════════════════════════════════════ */}
        <div className="login-showcase-panel">
          {/* Ambient Background Image Layer with Dark Overlay & Warm Vignette */}
          <div 
            className="showcase-bg-layer" 
            style={{ backgroundImage: `url(${heroImage})` }}
            aria-hidden="true"
          >
            <div className="showcase-bg-overlay" />
          </div>

          <div className="showcase-content">
            {/* Top Header with Brand Logo */}
            <div className="showcase-top-header">
              <Logo iconSize={26} titleSize="1.65rem" />
            </div>

            {/* Center Brand Showcase Body */}
            <div className="showcase-center-body">

              <h2 className="showcase-title">
                듣고 싶던 모든 음악,<br />
                <span className="text-gradient-warm">실시간 가사와 함께</span> 편안하게
              </h2>

              <p className="showcase-subtitle">
                나만의 취향과 분위기에 온전히 집중할 수 있도록,<br />
                실시간 가사와 함께 더 깊이 있는 음악 감상을 경험해 보세요.
              </p>

              {/* Service Feature Highlights */}
              <div className="showcase-feature-cards">
                <div className="showcase-feature-item">
                  <div className="feature-item-icon">
                    <Mic2 size={28} strokeWidth={1.5} />
                  </div>
                  <div className="feature-item-text">
                    <span className="feature-item-title">실시간 싱크 가사</span>
                    <span className="feature-item-desc">음악의 흐름에 맞춰 실시간으로 펼쳐지는 가사</span>
                  </div>
                </div>

                <div className="showcase-feature-item">
                  <div className="feature-item-icon">
                    <Disc3 size={28} strokeWidth={1.5} />
                  </div>
                  <div className="feature-item-text">
                    <span className="feature-item-title">감성 플레이리스트</span>
                    <span className="feature-item-desc">분위기와 취향에 맞춰 엄선된 테마별 음악 컬렉션</span>
                  </div>
                </div>

                <div className="showcase-feature-item">
                  <div className="feature-item-icon">
                    <ListMusic size={28} strokeWidth={1.5} />
                  </div>
                  <div className="feature-item-text">
                    <span className="feature-item-title">나만의 클라우드 보관함</span>
                    <span className="feature-item-desc">언제 어디서나 이어지는 나만의 트랙과 플레이리스트</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Showcase Footer */}
            <div className="showcase-footer">
              <span>© 2026 Croni. All rights reserved.</span>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════
            RIGHT AUTH FORM CARD
           ══════════════════════════════════════════════════════ */}
        <div className="login-auth-panel">
          <div className="login-form-card">
            {/* Mobile Header Logo */}
            <div className="login-mobile-header">
              <Logo iconSize={24} titleSize="1.5rem" />
            </div>

            {/* ══ 1. OTP 패널 ══ */}
            {panel === PANEL.OTP && (
              <div className="login-panel-content login-otp-panel">
                <div className="login-panel-icon-badge">
                  <MailCheck size={26} />
                </div>
                <div className="login-form-header text-center">
                  <h2 className="login-form-title">이메일 인증</h2>
                  <p className="login-form-desc">
                    <span className="highlight-email">{email}</span>으로 발송된<br />
                    6자리 인증 코드를 입력해 주세요.
                  </p>
                </div>

                <div className="login-otp-inputs" role="group" aria-label="6자리 인증 코드 입력">
                  {otpValues.map((val, i) => (
                    <input
                      key={i}
                      ref={(el) => (otpRefs.current[i] = el)}
                      id={`otp-digit-${i}`}
                      type="text"
                      inputMode="numeric"
                      maxLength={OTP_LENGTH}
                      className={`login-otp-box ${val ? 'filled' : ''} ${errorMsg ? 'has-error' : ''}`}
                      value={val}
                      onChange={(e) => handleOtpChange(i, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(i, e)}
                      onFocus={(e) => e.target.select()}
                      disabled={loading}
                      autoComplete="one-time-code"
                      aria-label={`인증 코드 ${i + 1}번째 자리`}
                    />
                  ))}
                </div>

                {errorMsg && (
                  <div className="login-alert alert-error">
                    <AlertCircle size={15} />
                    <span>{errorMsg}</span>
                  </div>
                )}
                {successMsg && (
                  <div className="login-alert alert-success">
                    <CheckCircle2 size={15} />
                    <span>{successMsg}</span>
                  </div>
                )}

                <Button
                  variant="primary"
                  size="lg"
                  className="login-action-submit"
                  onClick={() => handleVerifyOtp()}
                  disabled={loading || otpValues.join('').length < OTP_LENGTH}
                  loading={loading}
                >
                  인증 완료
                </Button>

                <div className="login-otp-footer">
                  <span className="otp-resend-label">인증 번호가 오지 않았나요?</span>
                  <button
                    type="button"
                    className="otp-resend-btn"
                    onClick={handleResend}
                    disabled={resendCooldown > 0 || loading}
                  >
                    <RefreshCw size={12} className={loading ? 'spinning' : ''} />
                    <span>
                      {resendCooldown > 0
                        ? `재발송 (${resendCooldown}초)`
                        : '인증 번호 재발송'}
                    </span>
                  </button>
                </div>

                <button
                  type="button"
                  className="login-text-back-btn"
                  onClick={() => switchPanel(PANEL.SIGNUP)}
                >
                  <ArrowLeft size={13} />
                  <span>이메일 주소 다시 입력하기</span>
                </button>
              </div>
            )}

            {/* ══ 2. 비밀번호 재설정 패널 ══ */}
            {panel === PANEL.RESET && (
              <div className="login-panel-content">
                <div className="login-form-header">
                  <h2 className="login-form-title">비밀번호 재설정</h2>
                  <p className="login-form-desc">
                    가입하신 이메일 주소를 입력하시면 비밀번호 변경 링크를 안전하게 보내드립니다.
                  </p>
                </div>

                <form className="login-form-body" onSubmit={handleReset}>
                  <Input
                    id="reset-email"
                    type="email"
                    size="lg"
                    label="이메일 주소"
                    placeholder="name@example.com"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    autoComplete="email"
                    disabled={loading}
                    leadingIcon={<Mail size={18} />}
                  />

                  {errorMsg && !successMsg && (
                    <div className="login-alert alert-error">
                      <AlertCircle size={15} />
                      <span>{errorMsg}</span>
                    </div>
                  )}
                  {successMsg && (
                    <div className="login-alert alert-success">
                      <CheckCircle2 size={15} />
                      <span>{successMsg}</span>
                    </div>
                  )}

                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    className="login-action-submit"
                    loading={loading}
                  >
                    재설정 링크 받기
                  </Button>
                </form>

                <button
                  type="button"
                  className="login-text-back-btn"
                  onClick={() => switchPanel(PANEL.LOGIN)}
                >
                  <ArrowLeft size={13} />
                  <span>로그인 화면으로 돌아가기</span>
                </button>
              </div>
            )}

            {/* ══ 3. 로그인 / 회원가입 메인 패널 ══ */}
            {(panel === PANEL.LOGIN || panel === PANEL.SIGNUP) && (
              <div className="login-panel-content">
                {/* Segmented Tab Switcher */}
                <div className="login-segmented-tabs" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={panel === PANEL.LOGIN}
                    className={`login-segment-btn ${panel === PANEL.LOGIN ? 'active' : ''}`}
                    onClick={() => switchPanel(PANEL.LOGIN)}
                  >
                    로그인
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={panel === PANEL.SIGNUP}
                    className={`login-segment-btn ${panel === PANEL.SIGNUP ? 'active' : ''}`}
                    onClick={() => switchPanel(PANEL.SIGNUP)}
                  >
                    회원가입
                  </button>
                </div>

                {/* ── 로그인 폼 ── */}
                {panel === PANEL.LOGIN && (
                  <form id="login-form" className="login-form-body" onSubmit={handleLogin} noValidate>
                    <Input
                      id="login-email"
                      type="email"
                      size="lg"
                      label="이메일"
                      placeholder="name@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      disabled={loading}
                      leadingIcon={<Mail size={18} />}
                    />

                    <div className="input-with-toggle-wrapper">
                      <Input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        size="lg"
                        label="비밀번호"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        disabled={loading}
                        leadingIcon={<Lock size={18} />}
                        trailingIcon={
                          <button
                            type="button"
                            className="input-eye-toggle-btn"
                            onClick={() => setShowPassword(!showPassword)}
                            tabIndex={-1}
                            aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                          >
                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        }
                      />
                    </div>

                    {errorMsg && (
                      <div className="login-alert alert-error">
                        <AlertCircle size={15} />
                        <span>{errorMsg}</span>
                      </div>
                    )}

                    <Button
                      id="login-submit-btn"
                      type="submit"
                      variant="primary"
                      size="lg"
                      className="login-action-submit"
                      loading={loading}
                    >
                      로그인
                    </Button>

                    <div className="login-sub-actions">
                      <button
                        type="button"
                        className="login-forgot-link"
                        onClick={() => switchPanel(PANEL.RESET)}
                      >
                        비밀번호를 잊으셨나요?
                      </button>
                    </div>
                  </form>
                )}

                {/* ── 회원가입 폼 ── */}
                {panel === PANEL.SIGNUP && (
                  <form id="signup-form" className="login-form-body" onSubmit={handleSignUp} noValidate>
                    <Input
                      id="signup-name"
                      type="text"
                      size="lg"
                      label="닉네임"
                      placeholder="홍길동"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      autoComplete="name"
                      disabled={loading}
                      leadingIcon={<User size={18} />}
                    />

                    <Input
                      id="signup-email"
                      type="email"
                      size="lg"
                      label="이메일"
                      placeholder="name@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      disabled={loading}
                      leadingIcon={<Mail size={18} />}
                    />

                    <div className="input-with-toggle-wrapper">
                      <Input
                        id="signup-password"
                        type={showPassword ? 'text' : 'password'}
                        size="lg"
                        label="비밀번호 (6자 이상)"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="new-password"
                        disabled={loading}
                        leadingIcon={<Lock size={18} />}
                        trailingIcon={
                          <button
                            type="button"
                            className="input-eye-toggle-btn"
                            onClick={() => setShowPassword(!showPassword)}
                            tabIndex={-1}
                            aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                          >
                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        }
                      />
                    </div>

                    <div className="input-with-toggle-wrapper">
                      <Input
                        id="signup-confirm"
                        type={showConfirmPw ? 'text' : 'password'}
                        size="lg"
                        label="비밀번호 확인"
                        placeholder="••••••••"
                        value={confirmPw}
                        onChange={(e) => setConfirmPw(e.target.value)}
                        autoComplete="new-password"
                        disabled={loading}
                        leadingIcon={<KeyRound size={18} />}
                        trailingIcon={
                          <button
                            type="button"
                            className="input-eye-toggle-btn"
                            onClick={() => setShowConfirmPw(!showConfirmPw)}
                            tabIndex={-1}
                            aria-label={showConfirmPw ? '비밀번호 숨기기' : '비밀번호 보기'}
                          >
                            {showConfirmPw ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        }
                      />
                    </div>

                    {confirmPw && password && (
                      <div className={`password-match-indicator ${password === confirmPw ? 'match' : 'mismatch'}`}>
                        {password === confirmPw ? (
                          <>
                            <CheckCircle2 size={13} />
                            <span>비밀번호가 일치합니다.</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle size={13} />
                            <span>비밀번호가 일치하지 않습니다.</span>
                          </>
                        )}
                      </div>
                    )}

                    {errorMsg && (
                      <div className="login-alert alert-error">
                        <AlertCircle size={15} />
                        <span>{errorMsg}</span>
                      </div>
                    )}

                    <Button
                      id="signup-submit-btn"
                      type="submit"
                      variant="primary"
                      size="lg"
                      className="login-action-submit"
                      loading={loading}
                    >
                      인증 코드 받기
                    </Button>
                  </form>
                )}

                {/* Crisp 1px Hairline Divider */}
                <div className="login-divider-row">
                  <div className="login-divider-line" />
                  <span className="login-divider-label">또는 소셜 계정으로 계속하기</span>
                  <div className="login-divider-line" />
                </div>

                {/* Google 1-Click Button */}
                <button
                  id="auth-google-btn"
                  type="button"
                  className="login-google-action-btn"
                  onClick={handleGoogle}
                  disabled={loading}
                >
                  <GoogleIcon />
                  <span>Google 계정으로 계속하기</span>
                </button>
              </div>
            )}

            {/* Legal Notice */}
            <div className="login-terms-notice">
              계속 진행하시면 sofar의{' '}
              <Link to="/terms" target="_blank" rel="noreferrer">
                이용약관
              </Link>{' '}
              및{' '}
              <Link to="/privacy" target="_blank" rel="noreferrer">
                개인정보 처리방침
              </Link>
              에 동의하게 됩니다.
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
