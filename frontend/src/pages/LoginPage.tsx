import { useState, FormEvent } from 'react';
import { useNavigate, useLocation, Navigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AppFooter from '../components/AppFooter';
import './LoginPage.css';

export default function LoginPage() {
  const { login, email, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const successMessage = (location.state as { message?: string })?.message;
  const [email_,   setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [busy,     setBusy]     = useState(false);

  if (loading) return null;
  if (email)   return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email_, password);
      navigate('/');
    } catch (err) {
      const msg = (err as Error).message ?? 'Login failed';
      if (msg.includes('not confirmed') || msg.includes('UserNotConfirmedException')) {
        navigate('/verify', { state: { email: email_.trim().toLowerCase() } });
      } else {
        setError(msg);
      }
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
          <div className="auth-hero">
            <p className="auth-hero__presents">TMRS Studios presents:</p>
            <img
              src="/LogoApplicationRegistryWhiteBackground.png"
              alt="App Registry"
              className="auth-hero__logo"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <p className="auth-hero__name">App Registry</p>
            <p className="auth-hero__tagline">Manage your enterprise application catalog.</p>
          </div>

          <h1 className="auth-card-title">Sign in</h1>

          <form className="auth-form" onSubmit={handleSubmit}>
            {successMessage && <div className="success-msg">{successMessage}</div>}
            {error && <div className="error-msg">{error}</div>}
            <div className="form-field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email_}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="form-field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
          <div className="auth-links">
            <Link to="/forgot-password">Forgot password?</Link>
            <span>No account? <Link to="/signup">Create one</Link></span>
          </div>
        </div>
      </main>

      <AppFooter />
    </div>
  );
}
