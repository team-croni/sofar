import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  KeyRound,
  ShieldCheck,
} from 'lucide-react';
import { useAuth, supabase } from '../contexts/AuthContext';
import { Button, Input, Logo, LoadingScreen } from '../components/ui';
import './PasswordResetPage.css';

export default function PasswordResetPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { updatePassword, verifyRecoveryToken } = useAuth();

  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [success, setSuccess] = useState(false);

  // 보안 검증: 이메일 링크를 클릭해 진입한 시점에 세션 또는 토큰 확인
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasValidTokenOrSession, setHasValidTokenOrSession] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const checkAuthStatus = async () => {
      const tokenHash = searchParams.get('token_hash');
      const hash = window.location.hash;
      const isRecoveryHash = hash.includes('type=recovery') || hash.includes('access_token');

      if (tokenHash || isRecoveryHash) {
        if (isMounted) {
          setHasValidTokenOrSession(true);
          setErrorMsg('');
          setCheckingSession(false);
        }
        return;
      }

      // 세션 확인 (Supabase가 URL hash를 파싱하여 자동 세션 주입한 경우)
      if (supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session && isMounted) {
          setHasValidTokenOrSession(true);
          setErrorMsg('');
          setCheckingSession(false);
          return;
        }
      }

      if (isMounted) {
        setHasValidTokenOrSession(false);
        setErrorMsg(
          '유효하지 않거나 만료된 비밀번호 재설정 요청입니다. 비밀번호 찾기를 다시 진행해 주세요.',
        );
        setCheckingSession(false);
      }
    };

    checkAuthStatus();

    return () => {
      isMounted = false;
    };
  }, [searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password) {
      setErrorMsg('새로운 비밀번호를 입력해 주세요.');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }
    if (password !== confirmPw) {
      setErrorMsg('비밀번호 확인이 일치하지 않습니다.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    const tokenHash = searchParams.get('token_hash');

    try {
      // 1단계: token_hash 쿼리가 있는 경우 명시적 1회용 토큰 검증
      if (tokenHash) {
        const { error: verifyError } = await verifyRecoveryToken(tokenHash);
        if (verifyError) {
          setErrorMsg(
            '보안 인증 토큰이 만료되었거나 올바르지 않습니다. 비밀번호 찾기를 다시 신청해 주세요.',
          );
          setLoading(false);
          return;
        }
      }

      // 2단계: 새 비밀번호로 업데이트
      const { error: updateError } = await updatePassword(password);

      if (updateError) {
        setErrorMsg('비밀번호 변경 실패: ' + updateError.message);
        if (supabase) await supabase.auth.signOut();
      } else {
        setSuccess(true);
        setTimeout(() => {
          navigate('/', { replace: true });
        }, 3000);
      }
    } catch (err) {
      setErrorMsg('비밀번호 변경 처리 중 오류가 발생했습니다.');
      if (supabase) await supabase.auth.signOut();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="reset-page">
      <div className="reset-ambient-glow" aria-hidden="true" />

      <div className="reset-card-container">
        {/* Top Logo */}
        <div className="reset-top-logo">
          <Logo iconSize={26} titleSize="1.65rem" onClick={() => navigate('/')} />
        </div>

        {checkingSession ? (
          <div className="reset-loading-card">
            <LoadingScreen fullScreen={false} size="sm" message="보안 인증 세션을 확인하고 있습니다..." />
          </div>
        ) : success ? (
          <div className="reset-success-card">
            <div className="reset-success-icon-wrap">
              <CheckCircle2 size={36} />
            </div>
            <h2 className="reset-card-title">비밀번호 변경 완료!</h2>
            <p className="reset-card-desc">
              새로운 비밀번호가 안전하게 설정되었습니다.<br />
              잠시 후 자동으로 sofar 메인 홈으로 이동합니다.
            </p>
            <Button
              variant="primary"
              size="lg"
              className="reset-submit-btn"
              onClick={() => navigate('/', { replace: true })}
            >
              지금 바로 홈으로 이동
            </Button>
          </div>
        ) : (
          <div className="reset-form-card">
            <div className="reset-card-header">
              <div className="reset-header-badge">
                <ShieldCheck size={14} />
                <span>계정 보안 재설정</span>
              </div>
              <h2 className="reset-card-title">새 비밀번호 설정 🔑</h2>
              <p className="reset-card-desc">
                계정 보호를 위해 6자 이상의 안전한 새 비밀번호를 등록해 주세요.
              </p>
            </div>

            <form className="reset-form" onSubmit={handleSubmit} noValidate>
              <div className="input-with-toggle-wrapper">
                <Input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  size="lg"
                  label="새 비밀번호 (6자 이상)"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  autoComplete="new-password"
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
                  id="confirm-password"
                  type={showConfirmPw ? 'text' : 'password'}
                  size="lg"
                  label="새 비밀번호 확인"
                  placeholder="••••••••"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  disabled={loading}
                  autoComplete="new-password"
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

              {/* Real-time Match feedback */}
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
                type="submit"
                variant="primary"
                size="lg"
                loading={loading}
                className="reset-submit-btn"
              >
                비밀번호 변경 완료
              </Button>
            </form>

            <button
              type="button"
              className="reset-back-btn"
              onClick={() => navigate('/login')}
              disabled={loading}
            >
              <ArrowLeft size={13} />
              <span>로그인 화면으로 이동</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
