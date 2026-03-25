import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, App } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import AppDetailModal from '../components/AppDetailModal';
import AppFormModal   from '../components/AppFormModal';

const FILTER_FIELDS = ['vendor', 'businessOwner', 'itContact', 'department', 'hoursOfOperation'] as const;
type FilterField = typeof FILTER_FIELDS[number];

const COL_LABELS: Record<FilterField, string> = {
  vendor: 'Vendor', businessOwner: 'Business Owner', itContact: 'IT Contact',
  department: 'Department', hoursOfOperation: 'Hours',
};

export default function CatalogPage() {
  const { isAdmin } = useAuth();
  const [searchParams] = useSearchParams();
  const [apps,    setApps]    = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [search,  setSearch]  = useState('');
  const [filters, setFilters] = useState<Partial<Record<FilterField, string>>>({});
  const [selected,setSelected]= useState<App | null>(null);
  const [adding,  setAdding]  = useState(false);

  function load() {
    setLoading(true);
    api.listApps({ limit: '1000' })
      .then(r => setApps(r.items))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  // Auto-open if ?id= param
  useEffect(() => {
    const id = searchParams.get('id');
    if (id && apps.length) {
      const app = apps.find(a => a.appId === id);
      if (app) setSelected(app);
    }
  }, [searchParams, apps]);

  // Unique values for filter dropdowns
  const options = useMemo(() => {
    const out: Partial<Record<FilterField, string[]>> = {};
    for (const f of FILTER_FIELDS) {
      out[f] = [...new Set(apps.map(a => (a[f] as string | undefined) ?? '').filter(Boolean))].sort();
    }
    return out;
  }, [apps]);

  const filtered = useMemo(() => {
    let result = apps;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(a => a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q));
    }
    for (const [k, v] of Object.entries(filters)) {
      if (v) result = result.filter(a => (a[k as FilterField] ?? '') === v);
    }
    return result;
  }, [apps, search, filters]);

  function clearFilter(key: FilterField) {
    setFilters(f => { const next = { ...f }; delete next[key]; return next; });
  }

  const activeFilters = (Object.entries(filters) as [FilterField, string][]).filter(([, v]) => v);

  if (loading) return <div className="text-gray-500">Loading…</div>;
  if (error)   return <div className="text-red-600">{error}</div>;

  return (
    <div className="space-y-4 max-w-full">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Application Catalog</h1>
        {isAdmin && (
          <button onClick={() => setAdding(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700">
            + Add App
          </button>
        )}
      </div>

      {/* Search + filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
        <input
          type="search"
          placeholder="Search by name or description…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <div className="flex flex-wrap gap-2">
          {FILTER_FIELDS.map(f => (
            <select key={f} value={filters[f] ?? ''}
              onChange={e => setFilters(prev => ({ ...prev, [f]: e.target.value || undefined }))}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
              <option value="">All {COL_LABELS[f]}</option>
              {(options[f] ?? []).map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          ))}
        </div>
        {activeFilters.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {activeFilters.map(([k, v]) => (
              <span key={k} className="inline-flex items-center bg-indigo-100 text-indigo-700 text-xs px-2 py-1 rounded-full">
                {COL_LABELS[k]}: {v}
                <button onClick={() => clearFilter(k)} className="ml-1 font-bold hover:text-indigo-900">×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Record count */}
      <p className="text-sm text-gray-500">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</p>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['Application', 'Vendor', 'Business Owner', 'IT Contact', 'Dept', 'Hours', 'Renewal Date', 'Status'].map(h => (
                <th key={h} className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">No records found</td></tr>
            )}
            {filtered.map(app => (
              <tr key={app.appId} onClick={() => setSelected(app)}
                className="border-b border-gray-50 hover:bg-indigo-50 cursor-pointer transition-colors">
                <td className="px-4 py-3 font-medium text-indigo-700">{app.name}</td>
                <td className="px-4 py-3 text-gray-700">{app.vendor}</td>
                <td className="px-4 py-3 text-gray-700">{app.businessOwner}</td>
                <td className="px-4 py-3 text-gray-700">{app.itContact}</td>
                <td className="px-4 py-3 text-gray-500">{app.department ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500">{app.hoursOfOperation}</td>
                <td className="px-4 py-3 text-gray-500">{app.renewalDate ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${app.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                    {app.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <AppDetailModal app={selected} onClose={() => setSelected(null)} onChanged={() => { setSelected(null); load(); }} />
      )}
      {adding && (
        <AppFormModal onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />
      )}
    </div>
  );
}
