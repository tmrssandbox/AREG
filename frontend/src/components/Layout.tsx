import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const NAV = [
  { path: '/',         label: 'Dashboard', adminOnly: false },
  { path: '/catalog',  label: 'Catalog',   adminOnly: false },
  { path: '/archive',  label: 'Archive',   adminOnly: true  },
  { path: '/import',   label: 'Import',    adminOnly: true  },
  { path: '/users',    label: 'Users',     adminOnly: true  },
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
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 bg-indigo-900 text-white flex flex-col shrink-0">
        <div className="px-5 py-4 font-bold text-lg border-b border-indigo-800">AREG</div>
        <nav className="flex-1 py-4">
          {NAV.filter(n => !n.adminOnly || isAdmin).map(n => (
            <Link
              key={n.path}
              to={n.path}
              className={`block px-5 py-2.5 text-sm hover:bg-indigo-800 transition-colors ${
                location.pathname === n.path ? 'bg-indigo-700 font-semibold' : ''
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-indigo-800 px-5 py-3 text-xs text-indigo-300 truncate">{email}</div>
        <button
          onClick={handleLogout}
          className="w-full px-5 py-3 text-sm text-left text-indigo-200 hover:bg-indigo-800"
        >
          Sign out
        </button>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto p-6">
        {children}
      </main>
    </div>
  );
}
