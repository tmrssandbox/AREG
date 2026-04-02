import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, App } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

function renewalColor(days: number): string {
  if (days <= 30)  return 'text-red-600 bg-red-50';
  if (days <= 60)  return 'text-amber-600 bg-amber-50';
  return 'text-green-700 bg-green-50';
}

function StatCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
      <div className="text-3xl font-bold text-indigo-700">{value}</div>
      <div className="text-sm font-medium text-gray-600 mt-1">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const { name, email } = useAuth();
  const [apps,    setApps]    = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api.listApps({ limit: '1000' })
      .then(r => setApps(r.items))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-gray-500">Loading…</div>;
  if (error)   return <div className="text-red-600">{error}</div>;

  const active    = apps.filter(a => a.status === 'active');
  const renewals  = active.filter(a => { const d = daysUntil(a.renewalDate); return d !== null && d <= 90; });
  const urgent    = active.filter(a => { const d = daysUntil(a.renewalDate); return d !== null && d <= 30; });

  // Apps by Technical Contact
  const byContact = active.reduce<Record<string, number>>((acc, a) => {
    acc[a.tmrsTechnicalContact] = (acc[a.tmrsTechnicalContact] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-2xl font-bold text-gray-800">Welcome, {name || email}</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Apps"          value={apps.length} />
        <StatCard label="Active"              value={active.length} />
        <StatCard label="Renewals ≤90d"       value={renewals.length} />
        <StatCard label="Urgent ≤30d"         value={urgent.length} sub="needs attention" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming renewals */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-700 mb-3">Upcoming Renewals (≤90 days)</h2>
          {renewals.length === 0
            ? <p className="text-sm text-gray-400">None</p>
            : <div className="space-y-2">
                {renewals
                  .sort((a, b) => (a.renewalDate ?? '').localeCompare(b.renewalDate ?? ''))
                  .map(a => {
                    const days = daysUntil(a.renewalDate)!;
                    return (
                      <div
                        key={a.appId}
                        onClick={() => navigate(`/catalog?id=${a.appId}`)}
                        className={`flex justify-between items-center px-3 py-2 rounded-lg cursor-pointer hover:opacity-80 ${renewalColor(days)}`}
                      >
                        <span className="text-sm font-medium truncate">{a.name}</span>
                        <span className="text-xs ml-2 shrink-0">{days}d — {a.renewalDate}</span>
                      </div>
                    );
                  })
                }
              </div>
          }
        </div>

        {/* By IT Contact */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-700 mb-3">Apps by Technical Contact</h2>
          {Object.keys(byContact).length === 0
            ? <p className="text-sm text-gray-400">No apps</p>
            : <div className="space-y-1.5">
                {Object.entries(byContact)
                  .sort((a, b) => b[1] - a[1])
                  .map(([contact, count]) => (
                    <div key={contact} className="flex justify-between text-sm">
                      <span className="truncate text-gray-700">{contact}</span>
                      <span className="font-semibold text-indigo-600 ml-2">{count}</span>
                    </div>
                  ))
                }
              </div>
          }
        </div>
      </div>
    </div>
  );
}
