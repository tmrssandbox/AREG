import { useEffect, useState } from 'react';
import { api, App } from '../lib/api';

export default function ArchivePage() {
  const [apps,    setApps]    = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [busy,    setBusy]    = useState<string | null>(null);

  function load() {
    setLoading(true);
    api.listArchived()
      .then(r => setApps(r.items))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function handleRestore(appId: string) {
    setBusy(appId);
    try {
      await api.restoreApp(appId);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div className="text-gray-500">Loading…</div>;
  if (error)   return <div className="text-red-600">{error}</div>;

  return (
    <div className="space-y-4 max-w-5xl">
      <h1 className="text-2xl font-bold text-gray-800">Archive</h1>
      <p className="text-sm text-gray-500">{apps.length} archived record{apps.length !== 1 ? 's' : ''}</p>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['Application', 'Vendor', 'IT Contact', 'Business Owner', 'Deleted', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {apps.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">No archived records</td></tr>
            )}
            {apps.map(app => (
              <tr key={app.appId} className="border-b border-gray-50">
                <td className="px-4 py-3 font-medium text-gray-700">{app.name}</td>
                <td className="px-4 py-3 text-gray-600">{app.vendor}</td>
                <td className="px-4 py-3 text-gray-600">{app.itContact}</td>
                <td className="px-4 py-3 text-gray-600">{app.businessOwner}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{app.modifiedAt?.slice(0, 10) ?? '—'}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleRestore(app.appId)}
                    disabled={busy === app.appId}
                    className="px-3 py-1 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {busy === app.appId ? 'Restoring…' : 'Restore'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
