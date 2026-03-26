import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { resetPassword, confirmResetPassword } from 'aws-amplify/auth';
import AppFooter from '../components/AppFooter';
import './LoginPage.css';

type Step = 'request' | 'confirm';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step,        setStep]        = useState<Step>('request');
  const [email,       setEmail]       = useState('');
  const [code,        setCode]        = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm,     setConfirm]     = useState('');
  const [error,       setError]       = useState('');
  const [busy,        setBusy]        = useState(false);

  async function handleRequest(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await resetPassword({ username: email.trim().toLowerCase() });
      setStep('confirm');
    } catch (err) {
      setError((err as Error).message ?? 'Failed to send reset code');
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (newPassword !== confirm) { setError('Passwords do not match'); return; }
    setBusy(true);
    try {
      await confirmResetPassword({
        username: email.trim().toLowerCase(),
        confirmationCode: code.trim(),
        newPassword,
      });
      navigate('/login', { state: { message: 'Password reset successfully. Sign in with your new password.' } });
    } catch (err) {
      setError((err as Error).message ?? 'Password reset failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <header className="auth-header">
        <a href="https://apps.tmrs.studio/" target="_blank" rel="noopener noreferrer">
          <img
            src="/tmrs-studios-logo.png"
            alt="TMRS Studios"
            className="auth-header__logo"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </a>
      </header>

      <main className="auth-main">
        <div className="auth-card">
          {step === 'request' ? (
            <>
              <h1 className="auth-card-title">Forgot password?</h1>
              <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
                Enter your email and we'll send you a reset code.
              </p>
              <form className="auth-form" onSubmit={handleRequest}>
                {error && <div className="error-msg">{error}</div>}
                <div className="form-field">
                  <label htmlFor="email">Email</label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <button type="submit" className="btn-primary" disabled={busy}>
                  {busy ? 'Sending…' : 'Send reset code'}
                </button>
              </form>
              <div className="auth-links">
                <Link to="/login">Back to sign in</Link>
              </div>
            </>
          ) : (
            <>
              <h1 className="auth-card-title">Reset your password</h1>
              <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
                A reset code was sent to <strong>{email}</strong>.
              </p>
              <form className="auth-form" onSubmit={handleConfirm}>
                {error && <div className="error-msg">{error}</div>}
                <div className="form-field">
                  <label htmlFor="code">Reset code</label>
                  <input
                    id="code"
                    type="text"
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    required
                    autoFocus
                    maxLength={6}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="newPassword">New password</label>
                  <input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="confirm">Confirm new password</label>
                  <input
                    id="confirm"
                    type="password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="btn-primary" disabled={busy}>
                  {busy ? 'Resetting…' : 'Reset password'}
                </button>
                <button type="button" className="btn-secondary" onClick={() => setStep('request')}>
                  Back
                </button>
              </form>
            </>
          )}
        </div>
      </main>

      <AppFooter />
    </div>
  );
}
