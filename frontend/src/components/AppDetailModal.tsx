import { useEffect, useState } from 'react';
import { api, App, AuditEntry } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import AppFormModal from './AppFormModal';

interface Props {
  app: App;
  onClose: () => void;
  onChanged: () => void;
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex text-sm py-1.5 border-b border-gray-100 last:border-0">
      <span className="w-40 shrink-0 text-gray-500 font-medium">{label}</span>
      <span className="text-gray-800">{value ?? '—'}</span>
    </div>
  );
}

export default function AppDetailModal({ app, onClose, onChanged }: Props) {
  const { isAdmin, isEditor, email } = useAuth();
  const [tab,        setTab]        = useState<'detail' | 'audit'>('detail');
  const [audit,      setAudit]      = useState<AuditEntry[]>([]);
  const [auditLoaded,setAuditLoaded]= useState(false);
  const [editing,    setEditing]    = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy,       setBusy]       = useState(false);
  const [error,      setError]      = useState('');

  const canEdit = isAdmin || (isEditor && (app.itContact === email || app.businessOwner === email));

  useEffect(() => {
    if (tab === 'audit' && !auditLoaded && isAdmin) {
      api.getAudit(app.appId).then(r => { setAudit(r.entries); setAuditLoaded(true); });
    }
  }, [tab, auditLoaded, isAdmin, app.appId]);

  async function handleDelete() {
    setBusy(true);
    try {
      await api.deleteApp(app.appId);
      onChanged();
      onClose();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  if (editing) {
    return <AppFormModal app={app} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onChanged(); onClose(); }} />;
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100">
          <h2 className="text-lg font-bold truncate">{app.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl font-bold ml-4">×</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-6">
          {['detail', ...(isAdmin ? ['audit'] : [])].map(t => (
            <button key={t} onClick={() => setTab(t as 'detail' | 'audit')}
              className={`mr-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="px-6 py-4">
          {tab === 'detail' && (
            <div className="space-y-1">
              <Row label="Description"      value={app.description} />
              <Row label="Vendor"           value={app.vendor} />
              <Row label="IT Contact"       value={app.itContact} />
              <Row label="Business Owner"   value={app.businessOwner} />
              <Row label="Department"       value={app.department} />
              <Row label="Hours"            value={app.hoursOfOperation} />
              <Row label="Renewal Date"     value={app.renewalDate} />
              <Row label="Status"           value={app.status} />
              <Row label="Notes"            value={app.notes} />
              <Row label="Created By"       value={app.createdBy} />
              <Row label="Created At"       value={app.createdAt?.slice(0, 10)} />
              <Row label="Modified By"      value={app.modifiedBy} />
              <Row label="Modified At"      value={app.modifiedAt?.slice(0, 10)} />
            </div>
          )}

          {tab === 'audit' && isAdmin && (
            <div className="space-y-3">
              {audit.length === 0 && <p className="text-sm text-gray-400">No audit entries.</p>}
              {audit.map((e, i) => (
                <div key={i} className="border border-gray-100 rounded-lg p-3 text-sm">
                  <div className="flex justify-between mb-1">
                    <span className="font-semibold text-indigo-700">{e.action}</span>
                    <span className="text-gray-400 text-xs">{e.timestamp.slice(0, 19).replace('T', ' ')}</span>
                  </div>
                  <div className="text-gray-500 text-xs mb-1">{e.userEmail}</div>
                  {e.diff && Object.entries(e.diff).map(([field, { old: o, new: n }]) => (
                    <div key={field} className="text-xs text-gray-600 mt-1">
                      <span className="font-medium">{field}:</span>{' '}
                      <span className="line-through text-red-400">{String(o)}</span>{' → '}
                      <span className="text-green-600">{String(n)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-6 pb-5 pt-2 border-t border-gray-100">
          {canEdit && (
            <button onClick={() => setEditing(true)}
              className="flex-1 border border-indigo-300 text-indigo-700 rounded-lg py-2 text-sm font-medium hover:bg-indigo-50">
              Edit
            </button>
          )}
          {isAdmin && !confirmDel && (
            <button onClick={() => setConfirmDel(true)}
              className="flex-1 border border-red-300 text-red-600 rounded-lg py-2 text-sm font-medium hover:bg-red-50">
              Delete
            </button>
          )}
          {confirmDel && (
            <>
              <button onClick={() => setConfirmDel(false)} className="flex-1 border border-gray-300 rounded-lg py-2 text-sm">Cancel</button>
              <button onClick={handleDelete} disabled={busy}
                className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
                {busy ? 'Deleting…' : 'Confirm Delete'}
              </button>
            </>
          )}
        </div>
        {error && <p className="text-sm text-red-600 px-6 pb-4">{error}</p>}
      </div>
    </div>
  );
}
