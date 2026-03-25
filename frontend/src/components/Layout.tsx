import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AppFooter from './AppFooter';
import './Layout.css';

const NAV = [
  { path: '/',        label: 'Dashboard', adminOnly: false },
  { path: '/catalog', label: 'Catalog',   adminOnly: false },
  { path: '/archive', label: 'Archive',   adminOnly: true  },
  { path: '/import',  label: 'Import',    adminOnly: true  },
  { path: '/users',   label: 'Users',     adminOnly: true  },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { email, isAdmin, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="app-shell">
      <div className="app-body">
        <aside className="sidebar">
          <a href="https://apps.tmrs.studio/" target="_blank" rel="noopener noreferrer" className="sidebar-brand">
            <img
              src="/logo.png"
              alt="TMRS Studios"
              className="sidebar-brand-logo"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <span className="sidebar-brand-label">AREG</span>
          </a>

          <nav className="sidebar-nav">
            {NAV.filter(n => !n.adminOnly || isAdmin).map(n => (
              <Link
                key={n.path}
                to={n.path}
                className={`sidebar-link${location.pathname === n.path ? ' active' : ''}`}
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="sidebar-user">
            <span className="sidebar-email">{email}</span>
            <button onClick={handleLogout} className="sidebar-signout">Sign out</button>
          </div>
        </aside>

        <main className="main-content">
          {children}
        </main>
      </div>

      <AppFooter />
    </div>
  );
}
