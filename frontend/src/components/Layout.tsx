import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AppFooter from './AppFooter';
import './Layout.css';

const NAV_LEFT = [
  { path: '/',        label: 'Home',      adminOnly: false, end: true },
  { path: '/catalog', label: 'Catalog',   adminOnly: false, end: false },
  { path: '/admin',   label: 'Admin',     adminOnly: true,  end: false },
];

const NAV_RIGHT = [
  { path: '/help',    label: 'Help',       adminOnly: false },
  { path: '/profile', label: 'My Profile', adminOnly: false },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { email, isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const visibleLeft  = NAV_LEFT.filter(n => !n.adminOnly || isAdmin);
  const visibleRight = NAV_RIGHT.filter(n => !n.adminOnly || isAdmin);

  return (
    <div className="app-shell">
      <header className="topnav">
        <div className="topnav-inner">
          <div className="topnav-left">
            <Link to="/" className="topnav-brand">
              <img
                src="/LogoApplicationRegistryWhiteBackground.png.png"
                alt="Application Registry"
                className="topnav-brand-logo"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <span className="topnav-brand-name">Application Registry</span>
            </Link>

            <nav className="topnav-nav">
              {visibleLeft.map(n => (
                <NavLink
                  key={n.path}
                  to={n.path}
                  end={n.end}
                  className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                >
                  {n.label}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="topnav-right">
            {visibleRight.map(n => (
              <NavLink
                key={n.path}
                to={n.path}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              >
                {n.label}
              </NavLink>
            ))}
            <div className="topnav-user">
              <span className="user-email">{email}</span>
              <button onClick={handleLogout} className="signout-btn">Sign out</button>
            </div>
          </div>
        </div>
      </header>

      <main className="main-content">
        {children}
      </main>

      <AppFooter />
    </div>
  );
}
