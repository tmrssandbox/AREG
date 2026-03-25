import { useState, FormEvent } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AppFooter from '../components/AppFooter';
import './LoginPage.css';

export default function LoginPage() {
  const { login, email, loading } = useAuth();
  const navigate = useNavigate();
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
      setError((err as Error).message ?? 'Login failed');
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
              src="/LogoAplicationRegistryWhiteBackground.png"
              alt="Application Registry"
              className="auth-hero__logo"
            />
            <p className="auth-hero__name">Application Registry</p>
            <p className="auth-hero__tagline">Manage your enterprise application catalog.</p>
          </div>

          <h1 className="auth-card-title">Sign in</h1>

          <form className="auth-form" onSubmit={handleSubmit}>
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
        </div>
      </main>

      <AppFooter />
    </div>
  );
}
