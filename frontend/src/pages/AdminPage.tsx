import { useRef, useState, useEffect, DragEvent } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { api, App } from '../lib/api';
import './AdminPage.css';

type AdminTab = 'archive' | 'import';

const BASE = 'https://aw3itbmhii.execute-api.us-east-2.amazonaws.com';

async function authToken(): Promise<string> {
  const s = await fetchAuthSession();
  return s.tokens?.idToken?.toString() ?? '';
}

export default function AdminPage() {
  const [tab, setTab] = useState<AdminTab>('archive');

  return (
    <div className="admin-page">
      <h1>Admin</h1>

      <div className="admin-tabs">
        {(['archive', 'import'] as AdminTab[]).map(t => (
          <button
            key={t}
            className={`admin-tab${tab === t ? ' active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'archive'  && <ArchiveSection />}
      {tab === 'import'   && <ImportSection />}
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

// ─── Import ───────────────────────────────────────────────────────────────────

const TEMPLATE_HEADERS = 'name,description,vendor,itContact,businessOwner,hoursOfOperation,department,renewalDate,notes';
const TEMPLATE_EXAMPLE = 'My App,A sample application,Acme Corp,it@company.com,owner@company.com,9-5 M-F,IT,2026-12-31,Optional notes';

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
                      <th className="px-3 py-2 text-left text-gray-500">IT Contact</th>
                      <th className="px-3 py-2 text-left text-gray-500">Renewal</th>
                      <th className="px-3 py-2 text-left text-gray-500">Errors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map(r => (
                      <tr key={r.row} className={`border-b border-gray-50 ${r.errors.length > 0 ? 'bg-red-50' : ''}`}>
                        <td className="px-3 py-2 text-gray-500">{r.row}</td>
                        <td className="px-3 py-2 font-medium">{r.data['name'] || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{r.data['vendor'] || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{r.data['itContact'] || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{r.data['renewalDate'] || '—'}</td>
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

