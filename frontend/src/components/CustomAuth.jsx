import React, { useState } from 'react';
import {
  signIn,
  signUp,
  confirmSignUp,
  resetPassword,
  confirmResetPassword,
  resendSignUpCode,
} from 'aws-amplify/auth';
import { BookOpen, TrendingUp, Zap, ArrowLeft } from 'lucide-react';
import Spinner from './Spinner';
import { useTheme } from '../useTheme';
import { Sun, Moon } from 'lucide-react';

/* ── Brand panel feature list ──────────────────────── */
const BRAND_FEATURES = [
  { Icon: BookOpen,   text: 'Curated courses built by industry practitioners' },
  { Icon: TrendingUp, text: 'Real-time progress tracking & milestones'        },
  { Icon: Zap,        text: 'Learn at your pace, on any device'               },
];

/*
  view state machine:
  'sign-in' | 'sign-up' | 'confirm' | 'forgot' | 'confirm-reset'
*/
const CustomAuth = ({ onSuccess }) => {
  const { theme, toggleTheme } = useTheme();

  const [view,            setView]            = useState('sign-in');
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState('');
  const [info,            setInfo]            = useState('');

  const [email,           setEmail]           = useState('');
  const [password,        setPassword]        = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code,            setCode]            = useState('');
  const [newPassword,     setNewPassword]     = useState('');

  const clear  = ()           => { setError(''); setInfo(''); };
  const go     = (v)          => { clear(); setView(v); };

  /* ── Auth handlers (direct Amplify v6 API calls) ──── */
  const handleSignIn = async (e) => {
    e.preventDefault();
    clear();
    setLoading(true);
    const username = email.trim().toLowerCase();
    try {
      const { isSignedIn } = await signIn({ username, password });
      if (isSignedIn) {
        onSuccess?.();   // triggers loadUser() in App.jsx
      } else {
        setError('Sign-in incomplete — please try again.');
      }
    } catch (err) {
      setError(err.message || 'Sign in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    clear();
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    setLoading(true);
    const username = email.trim().toLowerCase();
    try {
      await signUp({
        username,
        password,
        options: { userAttributes: { email: username } },
      });
      setEmail(username);
      setInfo(`Verification code sent to ${username}.`);
      go('confirm');
    } catch (err) {
      setError(err.message || 'Could not create account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (e) => {
    e.preventDefault();
    clear();
    setLoading(true);
    try {
      await confirmSignUp({ username: email, confirmationCode: code });
      setInfo('Account verified! You can now sign in.');
      go('sign-in');
    } catch (err) {
      setError(err.message || 'Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    clear();
    setLoading(true);
    const username = email.trim().toLowerCase();
    try {
      await resetPassword({ username });
      setInfo(`Reset code sent to ${username}.`);
      go('confirm-reset');
    } catch (err) {
      setError(err.message || 'Could not send reset code.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmReset = async (e) => {
    e.preventDefault();
    clear();
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      await confirmResetPassword({
        username: email.trim().toLowerCase(),
        confirmationCode: code,
        newPassword,
      });
      setInfo('Password reset! Sign in with your new password.');
      go('sign-in');
    } catch (err) {
      setError(err.message || 'Reset failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    clear();
    try {
      await resendSignUpCode({ username: email.trim().toLowerCase() });
      setInfo('A new code has been sent to your email.');
    } catch (err) {
      setError(err.message || 'Could not resend code.');
    }
  };

  /* ── Shared UI pieces ─────────────────────────────── */
  const Alerts = () => (
    <>
      {error && <div className="auth-alert auth-alert--error" role="alert">{error}</div>}
      {info  && <div className="auth-alert auth-alert--info"  role="status">{info}</div>}
    </>
  );

  const SubmitBtn = ({ label, busyLabel }) => (
    <button
      type="submit"
      className="btn btn-primary btn-full auth-submit-btn"
      disabled={loading}
    >
      {loading ? <><Spinner size="sm" />&nbsp;&nbsp;{busyLabel}</> : label}
    </button>
  );

  /* ── Render ────────────────────────────────────────── */
  return (
    <div className="auth-layout">

      {/* ════ LEFT — Brand Panel ════ */}
      <div className="auth-brand-panel" aria-hidden="true">
        <div className="auth-blob auth-blob-1" />
        <div className="auth-blob auth-blob-2" />
        <div className="auth-blob auth-blob-3" />
        <div className="auth-grid-pattern" />

        <div className="auth-brand-inner">
          <div className="auth-brand-logo">tx</div>
          <h1 className="auth-brand-headline">
            Master Your<br />
            <span className="auth-brand-headline-accent">Future.</span>
          </h1>
          <p className="auth-brand-sub">
            The platform built for developers who are serious about growth.
            No fluff — only real skills that ship to production.
          </p>
          <ul className="auth-brand-features">
            {BRAND_FEATURES.map((f) => {
              const Icon = f.Icon;
              return (
                <li key={f.text} className="auth-brand-feature">
                  <div className="auth-brand-feature-icon"><Icon size={17} /></div>
                  <span>{f.text}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* ════ RIGHT — Form Panel ════ */}
      <div className="auth-form-panel">

        <button
          id="auth-theme-toggle"
          className="auth-theme-btn"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        <div className="auth-form-inner">
          <div className="auth-mobile-logo">tx</div>

          {/* ── SIGN IN ── */}
          {view === 'sign-in' && (
            <>
              <div className="auth-view-header">
                <h2 className="auth-view-title">Welcome back</h2>
                <p className="auth-view-sub">Sign in to continue your learning journey.</p>
              </div>

              <div className="auth-tabs" role="tablist">
                <button className="auth-tab is-active" role="tab" aria-selected="true">
                  Sign In
                </button>
                <button className="auth-tab" role="tab" aria-selected="false"
                  onClick={() => go('sign-up')}>
                  Create Account
                </button>
              </div>

              <Alerts />

              <form onSubmit={handleSignIn} className="auth-form" noValidate>
                <div className="form-group">
                  <label className="auth-label" htmlFor="signin-email">Email</label>
                  <input id="signin-email" type="email" className="input"
                    value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com" required autoComplete="email" autoFocus />
                </div>

                <div className="form-group">
                  <label className="auth-label" htmlFor="signin-password">
                    <span className="auth-label-row">
                      Password
                      <button type="button" className="auth-link"
                        onClick={() => go('forgot')}>
                        Forgot password?
                      </button>
                    </span>
                  </label>
                  <input id="signin-password" type="password" className="input"
                    value={password} onChange={e => setPassword(e.target.value)}
                    required autoComplete="current-password" />
                </div>

                <SubmitBtn label="Sign In" busyLabel="Signing in…" />
              </form>

              <p className="auth-footer-note">
                Don't have an account?{' '}
                <button className="auth-link" onClick={() => go('sign-up')}>
                  Create one for free
                </button>
              </p>
            </>
          )}

          {/* ── SIGN UP ── */}
          {view === 'sign-up' && (
            <>
              <div className="auth-view-header">
                <h2 className="auth-view-title">Create account</h2>
                <p className="auth-view-sub">Start your developer growth journey today.</p>
              </div>

              <div className="auth-tabs" role="tablist">
                <button className="auth-tab" role="tab" aria-selected="false"
                  onClick={() => go('sign-in')}>
                  Sign In
                </button>
                <button className="auth-tab is-active" role="tab" aria-selected="true">
                  Create Account
                </button>
              </div>

              <Alerts />

              <form onSubmit={handleSignUp} className="auth-form" noValidate>
                <div className="form-group">
                  <label className="auth-label" htmlFor="signup-email">Email</label>
                  <input id="signup-email" type="email" className="input"
                    value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com" required autoComplete="email" autoFocus />
                </div>

                <div className="form-group">
                  <label className="auth-label" htmlFor="signup-password">Password</label>
                  <input id="signup-password" type="password" className="input"
                    value={password} onChange={e => setPassword(e.target.value)}
                    required minLength={8} autoComplete="new-password" />
                </div>

                <div className="form-group">
                  <label className="auth-label" htmlFor="signup-confirm">Confirm Password</label>
                  <input id="signup-confirm" type="password" className="input"
                    value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                    required autoComplete="new-password" />
                </div>

                <SubmitBtn label="Create Account" busyLabel="Creating account…" />
              </form>

              <p className="auth-footer-note">
                Already have an account?{' '}
                <button className="auth-link" onClick={() => go('sign-in')}>Sign in</button>
              </p>
            </>
          )}

          {/* ── CONFIRM SIGN-UP ── */}
          {view === 'confirm' && (
            <>
              <div className="auth-view-header">
                <div className="auth-view-icon">✉️</div>
                <h2 className="auth-view-title">Check your email</h2>
                <p className="auth-view-sub">
                  Enter the 6-digit code sent to <strong>{email}</strong>
                </p>
              </div>

              <Alerts />

              <form onSubmit={handleConfirm} className="auth-form" noValidate>
                <div className="form-group">
                  <label className="auth-label" htmlFor="confirm-code">Verification Code</label>
                  <input id="confirm-code" type="text" inputMode="numeric"
                    className="input auth-code-input"
                    value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="· · · · · ·" maxLength={6} required autoFocus />
                </div>
                <SubmitBtn label="Verify & Continue" busyLabel="Verifying…" />
              </form>

              <p className="auth-footer-note">
                Didn't receive a code?{' '}
                <button className="auth-link" onClick={handleResend}>Resend</button>
              </p>
            </>
          )}

          {/* ── FORGOT PASSWORD ── */}
          {view === 'forgot' && (
            <>
              <button className="auth-back-btn" onClick={() => go('sign-in')}>
                <ArrowLeft size={15} /> Back to Sign In
              </button>

              <div className="auth-view-header" style={{ marginTop: '16px' }}>
                <div className="auth-view-icon">🔑</div>
                <h2 className="auth-view-title">Reset Password</h2>
                <p className="auth-view-sub">
                  Enter your email and we'll send a reset code.
                </p>
              </div>

              <Alerts />

              <form onSubmit={handleForgotPassword} className="auth-form" noValidate>
                <div className="form-group">
                  <label className="auth-label" htmlFor="forgot-email">Email</label>
                  <input id="forgot-email" type="email" className="input"
                    value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com" required autoComplete="email" autoFocus />
                </div>
                <SubmitBtn label="Send Reset Code" busyLabel="Sending…" />
              </form>
            </>
          )}

          {/* ── CONFIRM RESET ── */}
          {view === 'confirm-reset' && (
            <>
              <button className="auth-back-btn" onClick={() => go('sign-in')}>
                <ArrowLeft size={15} /> Back to Sign In
              </button>

              <div className="auth-view-header" style={{ marginTop: '16px' }}>
                <div className="auth-view-icon">🛡️</div>
                <h2 className="auth-view-title">Set New Password</h2>
                <p className="auth-view-sub">
                  Enter the reset code from your email and a new password.
                </p>
              </div>

              <Alerts />

              <form onSubmit={handleConfirmReset} className="auth-form" noValidate>
                <div className="form-group">
                  <label className="auth-label" htmlFor="reset-code">Reset Code</label>
                  <input id="reset-code" type="text" inputMode="numeric"
                    className="input auth-code-input"
                    value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="· · · · · ·" maxLength={6} required autoFocus />
                </div>

                <div className="form-group">
                  <label className="auth-label" htmlFor="reset-new-pass">New Password</label>
                  <input id="reset-new-pass" type="password" className="input"
                    value={newPassword} onChange={e => setNewPassword(e.target.value)}
                    required minLength={8} autoComplete="new-password" />
                </div>

                <div className="form-group">
                  <label className="auth-label" htmlFor="reset-confirm-pass">
                    Confirm New Password
                  </label>
                  <input id="reset-confirm-pass" type="password" className="input"
                    value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                    required autoComplete="new-password" />
                </div>

                <SubmitBtn label="Reset Password" busyLabel="Resetting…" />
              </form>
            </>
          )}

        </div>
      </div>
    </div>
  );
};

export default CustomAuth;
