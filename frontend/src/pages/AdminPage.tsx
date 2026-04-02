import { useRef, useState, useEffect, DragEvent } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { api, App, ConfigValue, ServiceHoursValue, ServiceLevelValue } from '../lib/api';
import './AdminPage.css';

type AdminTab = 'archive' | 'import' | 'lookups';

const BASE = 'https://aw3itbmhii.execute-api.us-east-2.amazonaws.com';

async function authToken(): Promise<string> {
  const s = await fetchAuthSession();
  return s.tokens?.idToken?.toString() ?? '';
}

// Monthly downtime allowance in minutes
function downtimeMinutes(weeklyHours: number, percentage: number): number {
  const monthlyMinutes = weeklyHours * (365 / 12 / 7) * 60;
  return monthlyMinutes * (1 - percentage / 100);
}

function fmtDowntime(mins: number): string {
  if (mins >= 1) return mins.toFixed(1);
  return mins.toFixed(2);
}

export default function AdminPage() {
  const [tab, setTab] = useState<AdminTab>('archive');

  return (
    <div className="admin-page">
      <h1>Admin</h1>

      <div className="admin-tabs">
        {(['archive', 'import', 'lookups'] as AdminTab[]).map(t => (
          <button
            key={t}
            className={`admin-tab${tab === t ? ' active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'archive' && <ArchiveSection />}
      {tab === 'import'  && <ImportSection />}
      {tab === 'lookups' && <LookupsSection />}
    </div>
  );
}

// ─── Archive ──────────────────────────────────────────────────────────────────

function ArchiveSection() {
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
    <div className="space-y-4">
      <p className="text-sm text-gray-500">{apps.length} archived record{apps.length !== 1 ? 's' : ''}</p>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['Application', 'Vendor', 'TMRS Technical Contact', 'TMRS Business Owner', 'Deleted', ''].map(h => (
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
                <td className="px-4 py-3 text-gray-600">{app.vendorName}</td>
                <td className="px-4 py-3 text-gray-600">{app.tmrsTechnicalContact}</td>
                <td className="px-4 py-3 text-gray-600">{app.tmrsBusinessOwner}</td>
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

// ─── Import ───────────────────────────────────────────────────────────────────

const TEMPLATE_HEADERS = '"name","description","Vendor Name","TMRS Business Owner","TMRS Technical Contact","Service Hours","Service Level","TMRS Business Contact","Vendor Business Contact","Vendor Technical Contact","Department","Business Criticality","Renewal Date","Notes","Target Feature Utilization","Feature Utilization Status"';
const TEMPLATE_EXAMPLE = '"My App","A sample application","Acme Corp","Jane Smith","John Doe","Business Hours","99.9%","Mary Johnson","Bob Vendor","Alice Tech","IS","High","2026-12-31","Optional notes","80","45"';

interface PreviewRow { row: number; data: Record<string, string>; errors: string[] }
interface Summary { committed: boolean; created: number; updated: number; skipped: number; errors: number }

function ImportSection() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging]  = useState(false);
  const [csvText,  setCsvText]   = useState('');
  const [fileName, setFileName]  = useState('');
  const [preview,  setPreview]   = useState<PreviewRow[] | null>(null);
  const [summary,  setSummary]   = useState<Summary | null>(null);
  const [dupes,    setDupes]     = useState<'skip' | 'overwrite'>('skip');
  const [busy,     setBusy]      = useState(false);
  const [error,    setError]     = useState('');

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE_HEADERS + '\n' + TEMPLATE_EXAMPLE + '\n'], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'areg-import-template.csv'; a.click();
  }

  async function loadFile(file: File) {
    const text = await file.text();
    setCsvText(text); setFileName(file.name); setPreview(null); setSummary(null); setError('');
    await runPreview(text);
  }

  async function runPreview(text: string) {
    setBusy(true); setError('');
    try {
      const token = await authToken();
      const res = await fetch(`${BASE}/apps/import?commit=false`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/csv' }, body: text,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setPreview(data.rows);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function runImport() {
    setBusy(true); setError('');
    try {
      const token = await authToken();
      const res = await fetch(`${BASE}/apps/import?commit=true&duplicates=${dupes}`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/csv' }, body: csvText,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setSummary(data); setPreview(null);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  }

  const validCount   = preview?.filter(r => r.errors.length === 0).length ?? 0;
  const invalidCount = preview?.filter(r => r.errors.length > 0).length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Upload a CSV file to bulk-import applications.</p>
        <button onClick={downloadTemplate}
          className="text-sm text-indigo-600 border border-indigo-300 rounded-lg px-4 py-2 hover:bg-indigo-50">
          Download Template
        </button>
      </div>

      {!summary && (
        <>
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${dragging ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-indigo-400 hover:bg-gray-50'}`}
          >
            <input ref={fileRef} type="file" accept=".csv" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(f); }} />
            {fileName
              ? <p className="text-gray-700 font-medium">{fileName}</p>
              : <p className="text-gray-500 text-sm">Drag & drop a CSV file here, or click to browse</p>
            }
          </div>

          {preview && (
            <div className="space-y-4">
              <div className="flex gap-4 text-sm">
                <span className="text-gray-600">Total: <strong>{preview.length}</strong></span>
                <span className="text-green-600">Valid: <strong>{validCount}</strong></span>
                {invalidCount > 0 && <span className="text-red-600">Invalid: <strong>{invalidCount}</strong></span>}
              </div>

              <div className="flex items-center gap-4 text-sm">
                <span className="font-medium text-gray-700">Duplicates:</span>
                {(['skip', 'overwrite'] as const).map(v => (
                  <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" value={v} checked={dupes === v} onChange={() => setDupes(v)} />
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </label>
                ))}
              </div>

              <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-sm">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-500">Row</th>
                      <th className="px-3 py-2 text-left text-gray-500">Name</th>
                      <th className="px-3 py-2 text-left text-gray-500">Vendor</th>
                      <th className="px-3 py-2 text-left text-gray-500">Technical Contact</th>
                      <th className="px-3 py-2 text-left text-gray-500">Renewal</th>
                      <th className="px-3 py-2 text-left text-gray-500">Errors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map(r => (
                      <tr key={r.row} className={`border-b border-gray-50 ${r.errors.length > 0 ? 'bg-red-50' : ''}`}>
                        <td className="px-3 py-2 text-gray-500">{r.row}</td>
                        <td className="px-3 py-2 font-medium">{r.data['name'] || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{r.data['Vendor Name'] || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{r.data['TMRS Technical Contact'] || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{r.data['Renewal Date'] || '—'}</td>
                        <td className="px-3 py-2 text-red-600">{r.errors.join('; ') || '✓'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button onClick={runImport} disabled={busy || validCount === 0}
                className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
                {busy ? 'Importing…' : `Import ${validCount} valid record${validCount !== 1 ? 's' : ''}`}
              </button>
            </div>
          )}

          {busy && !preview && <p className="text-sm text-gray-500">Parsing…</p>}
          {error && !preview && <p className="text-sm text-red-600">{error}</p>}
        </>
      )}

      {summary && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-800">Import Complete</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[['Created', summary.created, 'text-green-700'], ['Updated', summary.updated, 'text-blue-700'],
              ['Skipped', summary.skipped, 'text-amber-600'], ['Errors', summary.errors, 'text-red-600']].map(([label, val, cls]) => (
              <div key={label as string} className="text-center">
                <div className={`text-3xl font-bold ${cls}`}>{val}</div>
                <div className="text-sm text-gray-500 mt-1">{label}</div>
              </div>
            ))}
          </div>
          <button onClick={() => { setSummary(null); setCsvText(''); setFileName(''); }}
            className="text-sm text-indigo-600 hover:underline">Import another file</button>
        </div>
      )}
    </div>
  );
}

// ─── Lookups ──────────────────────────────────────────────────────────────────

function LookupsSection() {
  const [serviceHours,  setServiceHours]  = useState<ServiceHoursValue[]>([]);
  const [serviceLevels, setServiceLevels] = useState<ServiceLevelValue[]>([]);
  const [departments,   setDepartments]   = useState<ConfigValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  async function loadAll() {
    setLoading(true);
    try {
      const [sh, sl, dept] = await Promise.all([
        api.getConfig('serviceHours'),
        api.getConfig('serviceLevel'),
        api.getConfig('department'),
      ]);
      setServiceHours(sh as ServiceHoursValue[]);
      setServiceLevels(sl as ServiceLevelValue[]);
      setDepartments(dept);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  if (loading) return <div className="text-gray-500">Loading…</div>;
  if (error)   return <div className="text-red-600">{error}</div>;

  return (
    <div className="space-y-8">
      <ServiceHoursSection values={serviceHours} levels={serviceLevels} onChanged={loadAll} />
      <ServiceLevelSection values={serviceLevels} onChanged={loadAll} />
      <DepartmentSection   values={departments}   onChanged={loadAll} />
    </div>
  );
}

// ─── Service Hours ────────────────────────────────────────────────────────────

function ServiceHoursSection({ values, levels, onChanged }: {
  values: ServiceHoursValue[];
  levels: ServiceLevelValue[];
  onChanged: () => void;
}) {
  const [editId,  setEditId]  = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editDef,   setEditDef]   = useState('');
  const [editHours, setEditHours] = useState('');
  const [addLabel,  setAddLabel]  = useState('');
  const [addDef,    setAddDef]    = useState('');
  const [addHours,  setAddHours]  = useState('');
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState('');

  function startEdit(v: ServiceHoursValue) {
    setEditId(v.id); setEditLabel(v.label); setEditDef(v.definition); setEditHours(String(v.weeklyHours));
  }

  async function saveEdit() {
    if (!editId) return;
    setBusy(true); setErr('');
    try {
      await api.updateConfigValue('serviceHours', editId, {
        label: editLabel, definition: editDef, weeklyHours: Number(editHours),
      });
      setEditId(null); onChanged();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this service hours definition?')) return;
    setBusy(true); setErr('');
    try {
      await api.deleteConfigValue('serviceHours', id);
      onChanged();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  async function handleAdd() {
    if (!addLabel || !addDef || !addHours) { setErr('All fields are required'); return; }
    setBusy(true); setErr('');
    try {
      await api.addConfigValue('serviceHours', { label: addLabel, definition: addDef, weeklyHours: Number(addHours) });
      setAddLabel(''); setAddDef(''); setAddHours(''); onChanged();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="settings-section-card">
      <h2>Service Hours</h2>
      {err && <p className="text-sm text-red-600 mb-3">{err}</p>}

      <table className="w-full text-sm mb-4">
        <thead>
          <tr className="text-left text-gray-500 border-b border-gray-100">
            <th className="pb-2 font-medium">Label</th>
            <th className="pb-2 font-medium">Description</th>
            <th className="pb-2 font-medium">Hrs/wk</th>
            <th className="pb-2" />
          </tr>
        </thead>
        <tbody>
          {values.length === 0 && (
            <tr><td colSpan={4} className="py-4 text-gray-400 text-sm">No values defined</td></tr>
          )}
          {values.map(v => editId === v.id ? (
            <tr key={v.id} className="border-b border-gray-50">
              <td className="py-2 pr-2">
                <input className="settings-text-input w-full" value={editLabel} onChange={e => setEditLabel(e.target.value)} />
              </td>
              <td className="py-2 pr-2">
                <input className="settings-text-input w-full" value={editDef} onChange={e => setEditDef(e.target.value)} />
              </td>
              <td className="py-2 pr-2">
                <input className="settings-text-input" type="number" style={{maxWidth:80}} value={editHours} onChange={e => setEditHours(e.target.value)} />
              </td>
              <td className="py-2 flex gap-2">
                <button onClick={saveEdit} disabled={busy} className="btn-add-domain text-xs">Save</button>
                <button onClick={() => setEditId(null)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
              </td>
            </tr>
          ) : (
            <tr key={v.id} className="border-b border-gray-50">
              <td className="py-2 pr-2 font-medium text-gray-800">{v.label}</td>
              <td className="py-2 pr-2 text-gray-600">{v.definition}</td>
              <td className="py-2 pr-2 text-gray-600">{v.weeklyHours}</td>
              <td className="py-2 flex gap-3">
                <button onClick={() => startEdit(v)} className="text-xs text-indigo-600 hover:underline">Edit</button>
                <button onClick={() => handleDelete(v.id)} disabled={busy} className="text-xs text-red-500 hover:underline">Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Add new row */}
      <div className="flex gap-2 items-end flex-wrap mb-6">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">Label</span>
          <input className="settings-text-input" placeholder="e.g. Business Hours" value={addLabel} onChange={e => setAddLabel(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">Description</span>
          <input className="settings-text-input" style={{maxWidth:200}} placeholder="e.g. Mon-Fri 7a-7p" value={addDef} onChange={e => setAddDef(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">Hours/week</span>
          <input className="settings-text-input" type="number" style={{maxWidth:90}} placeholder="60" value={addHours} onChange={e => setAddHours(e.target.value)} />
        </div>
        <button onClick={handleAdd} disabled={busy} className="btn-add-domain">Add</button>
      </div>

      {/* Live downtime preview matrix */}
      {values.length > 0 && levels.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-2 font-medium">Downtime allowance preview (monthly minutes)</p>
          <div className="overflow-x-auto">
            <table className="text-xs border border-gray-200 rounded">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-3 py-2 text-left text-gray-500 font-medium border-b border-gray-200">Service Hours</th>
                  {levels.map(sl => (
                    <th key={sl.id} className="px-3 py-2 text-center text-gray-500 font-medium border-b border-gray-200">{sl.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {values.map(sh => (
                  <tr key={sh.id} className="border-b border-gray-100">
                    <td className="px-3 py-2 text-gray-700 font-medium">{sh.label}</td>
                    {levels.map(sl => (
                      <td key={sl.id} className="px-3 py-2 text-center text-gray-600">
                        {fmtDowntime(downtimeMinutes(sh.weeklyHours, sl.percentage))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Service Level ────────────────────────────────────────────────────────────

function ServiceLevelSection({ values, onChanged }: {
  values: ServiceLevelValue[];
  onChanged: () => void;
}) {
  const [editId,  setEditId]  = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editPct,   setEditPct]   = useState('');
  const [addLabel,  setAddLabel]  = useState('');
  const [addPct,    setAddPct]    = useState('');
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState('');

  function startEdit(v: ServiceLevelValue) {
    setEditId(v.id); setEditLabel(v.label); setEditPct(String(v.percentage));
  }

  async function saveEdit() {
    if (!editId) return;
    setBusy(true); setErr('');
    try {
      await api.updateConfigValue('serviceLevel', editId, { label: editLabel, percentage: Number(editPct) });
      setEditId(null); onChanged();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this service level?')) return;
    setBusy(true); setErr('');
    try {
      await api.deleteConfigValue('serviceLevel', id);
      onChanged();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  async function handleAdd() {
    if (!addLabel || !addPct) { setErr('Label and percentage are required'); return; }
    setBusy(true); setErr('');
    try {
      await api.addConfigValue('serviceLevel', { label: addLabel, percentage: Number(addPct) });
      setAddLabel(''); setAddPct(''); onChanged();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="settings-section-card">
      <h2>Service Level</h2>
      {err && <p className="text-sm text-red-600 mb-3">{err}</p>}

      <table className="w-full text-sm mb-4">
        <thead>
          <tr className="text-left text-gray-500 border-b border-gray-100">
            <th className="pb-2 font-medium">Label</th>
            <th className="pb-2 font-medium">Percentage</th>
            <th className="pb-2" />
          </tr>
        </thead>
        <tbody>
          {values.length === 0 && (
            <tr><td colSpan={3} className="py-4 text-gray-400 text-sm">No values defined</td></tr>
          )}
          {values.map(v => editId === v.id ? (
            <tr key={v.id} className="border-b border-gray-50">
              <td className="py-2 pr-2">
                <input className="settings-text-input" value={editLabel} onChange={e => setEditLabel(e.target.value)} />
              </td>
              <td className="py-2 pr-2">
                <input className="settings-text-input" type="number" style={{maxWidth:100}} value={editPct} onChange={e => setEditPct(e.target.value)} />
              </td>
              <td className="py-2 flex gap-2">
                <button onClick={saveEdit} disabled={busy} className="btn-add-domain text-xs">Save</button>
                <button onClick={() => setEditId(null)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
              </td>
            </tr>
          ) : (
            <tr key={v.id} className="border-b border-gray-50">
              <td className="py-2 pr-2 font-medium text-gray-800">{v.label}</td>
              <td className="py-2 pr-2 text-gray-600">{v.percentage}%</td>
              <td className="py-2 flex gap-3">
                <button onClick={() => startEdit(v)} className="text-xs text-indigo-600 hover:underline">Edit</button>
                <button onClick={() => handleDelete(v.id)} disabled={busy} className="text-xs text-red-500 hover:underline">Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex gap-2 items-end flex-wrap">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">Label</span>
          <input className="settings-text-input" placeholder="e.g. 99.9%" value={addLabel} onChange={e => setAddLabel(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">Percentage (e.g. 99.9)</span>
          <input className="settings-text-input" type="number" style={{maxWidth:120}} placeholder="99.9" value={addPct} onChange={e => setAddPct(e.target.value)} />
        </div>
        <button onClick={handleAdd} disabled={busy} className="btn-add-domain">Add</button>
      </div>
    </div>
  );
}

// ─── Department ───────────────────────────────────────────────────────────────

function DepartmentSection({ values, onChanged }: {
  values: ConfigValue[];
  onChanged: () => void;
}) {
  const [editId,    setEditId]    = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [addLabel,  setAddLabel]  = useState('');
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState('');

  async function saveEdit() {
    if (!editId) return;
    setBusy(true); setErr('');
    try {
      await api.updateConfigValue('department', editId, { label: editLabel });
      setEditId(null); onChanged();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this department?')) return;
    setBusy(true); setErr('');
    try {
      await api.deleteConfigValue('department', id);
      onChanged();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  async function handleAdd() {
    if (!addLabel) { setErr('Label is required'); return; }
    setBusy(true); setErr('');
    try {
      await api.addConfigValue('department', { label: addLabel });
      setAddLabel(''); onChanged();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="settings-section-card">
      <h2>Department</h2>
      {err && <p className="text-sm text-red-600 mb-3">{err}</p>}

      <table className="w-full text-sm mb-4">
        <thead>
          <tr className="text-left text-gray-500 border-b border-gray-100">
            <th className="pb-2 font-medium">Name</th>
            <th className="pb-2" />
          </tr>
        </thead>
        <tbody>
          {values.length === 0 && (
            <tr><td colSpan={2} className="py-4 text-gray-400 text-sm">No departments defined</td></tr>
          )}
          {values.map(v => editId === v.id ? (
            <tr key={v.id} className="border-b border-gray-50">
              <td className="py-2 pr-2">
                <input className="settings-text-input" value={editLabel} onChange={e => setEditLabel(e.target.value)} />
              </td>
              <td className="py-2 flex gap-2">
                <button onClick={saveEdit} disabled={busy} className="btn-add-domain text-xs">Save</button>
                <button onClick={() => setEditId(null)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
              </td>
            </tr>
          ) : (
            <tr key={v.id} className="border-b border-gray-50">
              <td className="py-2 pr-2 font-medium text-gray-800">{v.label}</td>
              <td className="py-2 flex gap-3">
                <button onClick={() => { setEditId(v.id); setEditLabel(v.label); }} className="text-xs text-indigo-600 hover:underline">Edit</button>
                <button onClick={() => handleDelete(v.id)} disabled={busy} className="text-xs text-red-500 hover:underline">Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex gap-2 items-end">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">Name</span>
          <input className="settings-text-input" placeholder="e.g. Finance" value={addLabel} onChange={e => setAddLabel(e.target.value)} />
        </div>
        <button onClick={handleAdd} disabled={busy} className="btn-add-domain">Add</button>
      </div>
    </div>
  );
}
