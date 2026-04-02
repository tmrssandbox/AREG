import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, App, ConfigValue, ServiceHoursValue, ServiceLevelValue } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import AppDetailModal from '../components/AppDetailModal';
import AppFormModal   from '../components/AppFormModal';

// Config maps for resolving IDs to labels
interface ConfigMaps {
  serviceHours: Map<string, string>;
  serviceLevel: Map<string, string>;
  department:   Map<string, string>;
}

function buildMap(values: ConfigValue[]): Map<string, string> {
  return new Map(values.map(v => [v.id, v.label]));
}

// Filterable free-text fields (derived from app data)
const TEXT_FILTER_FIELDS = ['vendorName', 'tmrsBusinessOwner', 'tmrsTechnicalContact', 'businessCriticality'] as const;
type TextFilterField = typeof TEXT_FILTER_FIELDS[number];

const TEXT_LABELS: Record<TextFilterField, string> = {
  vendorName: 'Vendor', tmrsBusinessOwner: 'Business Owner',
  tmrsTechnicalContact: 'Technical Contact', businessCriticality: 'Criticality',
};

export default function CatalogPage() {
  const { isAdmin } = useAuth();
  const [searchParams] = useSearchParams();
  const [apps,    setApps]    = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [search,  setSearch]  = useState('');
  const [filters, setFilters] = useState<Partial<Record<TextFilterField, string>>>({});
  // Config-backed filters store config IDs
  const [shFilter,   setShFilter]   = useState('');
  const [slFilter,   setSlFilter]   = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [selected,   setSelected]   = useState<App | null>(null);
  const [adding,     setAdding]     = useState(false);
  const [configMaps, setConfigMaps] = useState<ConfigMaps>({
    serviceHours: new Map(), serviceLevel: new Map(), department: new Map(),
  });
  const [serviceHoursList, setServiceHoursList] = useState<ServiceHoursValue[]>([]);
  const [serviceLevelList, setServiceLevelList] = useState<ServiceLevelValue[]>([]);
  const [departmentList,   setDepartmentList]   = useState<ConfigValue[]>([]);

  function load() {
    setLoading(true);
    Promise.all([
      api.listApps({ limit: '1000' }),
      api.getConfig('serviceHours'),
      api.getConfig('serviceLevel'),
      api.getConfig('department'),
    ]).then(([appsRes, sh, sl, dept]) => {
      setApps(appsRes.items);
      setServiceHoursList(sh as ServiceHoursValue[]);
      setServiceLevelList(sl as ServiceLevelValue[]);
      setDepartmentList(dept);
      setConfigMaps({
        serviceHours: buildMap(sh),
        serviceLevel: buildMap(sl),
        department:   buildMap(dept),
      });
    }).catch(e => setError(e.message))
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

  // Unique values for free-text filter dropdowns
  const textOptions = useMemo(() => {
    const out: Partial<Record<TextFilterField, string[]>> = {};
    for (const f of TEXT_FILTER_FIELDS) {
      out[f] = [...new Set(apps.map(a => (a[f] as string | undefined) ?? '').filter(Boolean))].sort();
    }
    return out;
  }, [apps]);

  const filtered = useMemo(() => {
    let result = apps;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(a => a.name.toLowerCase().includes(q) || (a.description ?? '').toLowerCase().includes(q));
    }
    for (const [k, v] of Object.entries(filters)) {
      if (v) result = result.filter(a => (a[k as TextFilterField] ?? '') === v);
    }
    if (shFilter)   result = result.filter(a => a.serviceHours === shFilter);
    if (slFilter)   result = result.filter(a => a.serviceLevel === slFilter);
    if (deptFilter) result = result.filter(a => a.department   === deptFilter);
    return result;
  }, [apps, search, filters, shFilter, slFilter, deptFilter]);

  function clearFilter(key: TextFilterField) {
    setFilters(f => { const next = { ...f }; delete next[key]; return next; });
  }

  const activeFilters = (Object.entries(filters) as [TextFilterField, string][]).filter(([, v]) => v);
  const hasConfigFilters = shFilter || slFilter || deptFilter;

  function resolve(map: Map<string, string>, id?: string): string {
    if (!id) return '—';
    return map.get(id) ?? id;
  }

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
          {/* Free-text field filters */}
          {TEXT_FILTER_FIELDS.map(f => (
            <select key={f} value={filters[f] ?? ''}
              onChange={e => setFilters(prev => ({ ...prev, [f]: e.target.value || undefined }))}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
              <option value="">All {TEXT_LABELS[f]}</option>
              {(textOptions[f] ?? []).map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          ))}

          {/* Config-backed filters */}
          <select value={shFilter} onChange={e => setShFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
            <option value="">All Service Hours</option>
            {serviceHoursList.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>

          <select value={slFilter} onChange={e => setSlFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
            <option value="">All Service Levels</option>
            {serviceLevelList.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>

          <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
            <option value="">All Departments</option>
            {departmentList.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </div>

        {(activeFilters.length > 0 || hasConfigFilters) && (
          <div className="flex flex-wrap gap-2">
            {activeFilters.map(([k, v]) => (
              <span key={k} className="inline-flex items-center bg-indigo-100 text-indigo-700 text-xs px-2 py-1 rounded-full">
                {TEXT_LABELS[k]}: {v}
                <button onClick={() => clearFilter(k)} className="ml-1 font-bold hover:text-indigo-900">×</button>
              </span>
            ))}
            {shFilter && (
              <span className="inline-flex items-center bg-indigo-100 text-indigo-700 text-xs px-2 py-1 rounded-full">
                Hours: {configMaps.serviceHours.get(shFilter)}
                <button onClick={() => setShFilter('')} className="ml-1 font-bold hover:text-indigo-900">×</button>
              </span>
            )}
            {slFilter && (
              <span className="inline-flex items-center bg-indigo-100 text-indigo-700 text-xs px-2 py-1 rounded-full">
                Level: {configMaps.serviceLevel.get(slFilter)}
                <button onClick={() => setSlFilter('')} className="ml-1 font-bold hover:text-indigo-900">×</button>
              </span>
            )}
            {deptFilter && (
              <span className="inline-flex items-center bg-indigo-100 text-indigo-700 text-xs px-2 py-1 rounded-full">
                Dept: {configMaps.department.get(deptFilter)}
                <button onClick={() => setDeptFilter('')} className="ml-1 font-bold hover:text-indigo-900">×</button>
              </span>
            )}
          </div>
        )}
      </div>

      <p className="text-sm text-gray-500">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</p>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['Application', 'Department', 'Business Owner', 'Technical Contact', 'Service Hours', 'Service Level', 'Criticality', 'Status', 'Renewal Date'].map(h => (
                <th key={h} className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="text-center py-8 text-gray-400">No records found</td></tr>
            )}
            {filtered.map(app => (
              <tr key={app.appId} onClick={() => setSelected(app)}
                className="border-b border-gray-50 hover:bg-indigo-50 cursor-pointer transition-colors">
                <td className="px-4 py-3 font-medium text-indigo-700">{app.name}</td>
                <td className="px-4 py-3 text-gray-500">{resolve(configMaps.department, app.department)}</td>
                <td className="px-4 py-3 text-gray-700">{app.tmrsBusinessOwner}</td>
                <td className="px-4 py-3 text-gray-700">{app.tmrsTechnicalContact}</td>
                <td className="px-4 py-3 text-gray-500">{resolve(configMaps.serviceHours, app.serviceHours)}</td>
                <td className="px-4 py-3 text-gray-500">{resolve(configMaps.serviceLevel, app.serviceLevel)}</td>
                <td className="px-4 py-3 text-gray-500">{app.businessCriticality ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${app.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                    {app.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">{app.renewalDate ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <AppDetailModal app={selected} configMaps={configMaps} onClose={() => setSelected(null)} onChanged={() => { setSelected(null); load(); }} />
      )}
      {adding && (
        <AppFormModal onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />
      )}
    </div>
  );
}
