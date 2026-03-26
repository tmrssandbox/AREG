import { useState, FormEvent } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { confirmSignUp, resendSignUpCode } from 'aws-amplify/auth';
import AppFooter from '../components/AppFooter';
import './LoginPage.css';

export default function VerifyEmailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const emailFromState = (location.state as { email?: string })?.email || '';

  const [email,     setEmail]     = useState(emailFromState);
  const [code,      setCode]      = useState('');
  const [error,     setError]     = useState('');
  const [success,   setSuccess]   = useState('');
  const [busy,      setBusy]      = useState(false);
  const [resending, setResending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await confirmSignUp({ username: email.trim().toLowerCase(), confirmationCode: code.trim() });
      navigate('/login', { state: { message: 'Email verified. You can now sign in.' } });
    } catch (err) {
      setError((err as Error).message ?? 'Verification failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    setError('');
    setSuccess('');
    setResending(true);
    try {
      await resendSignUpCode({ username: email.trim().toLowerCase() });
      setSuccess('A new code has been sent to your email.');
    } catch (err) {
      setError((err as Error).message ?? 'Failed to resend code');
    } finally {
      setResending(false);
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
          <h1 className="auth-card-title">Verify your email</h1>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
            We sent a verification code to <strong>{email || 'your email'}</strong>. Enter it below to confirm your account.
          </p>
          <form className="auth-form" onSubmit={handleSubmit}>
            {error   && <div className="error-msg">{error}</div>}
            {success && <div className="success-msg">{success}</div>}
            {!emailFromState && (
              <div className="form-field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>
            )}
            <div className="form-field">
              <label htmlFor="code">Verification code</label>
              <input
                id="code"
                type="text"
                value={code}
                onChange={e => setCode(e.target.value)}
                required
                autoFocus
                maxLength={6}
                placeholder="123456"
              />
            </div>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Verifying…' : 'Verify email'}
            </button>
            <button type="button" className="btn-secondary" onClick={handleResend} disabled={resending}>
              {resending ? 'Sending…' : 'Resend code'}
            </button>
          </form>
          <div className="auth-links">
            <Link to="/login">Back to sign in</Link>
          </div>
        </div>
      </main>

      <AppFooter />
    </div>
  );
}
