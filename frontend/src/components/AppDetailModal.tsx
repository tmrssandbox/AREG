import { useEffect, useState } from 'react';
import { api, App, AuditEntry } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import AppFormModal from './AppFormModal';
import './Modal.css';

interface Props {
  app: App;
  onClose: () => void;
  onChanged: () => void;
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="modal-row">
      <span className="modal-row-label">{label}</span>
      <span className="modal-row-value">{value ?? '—'}</span>
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
    <div className="modal-overlay">
      <div className="modal modal--md">
        <div className="modal-header">
          <h2>{app.name}</h2>
          <button onClick={onClose} className="modal-close">×</button>
        </div>

        <div className="modal-tabs">
          {(['detail', ...(isAdmin ? ['audit'] : [])] as const).map(t => (
            <button key={t} onClick={() => setTab(t as 'detail' | 'audit')}
              className={`modal-tab${tab === t ? ' active' : ''}`}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="modal-body">
          {tab === 'detail' && (
            <div>
              <Row label="Description"    value={app.description} />
              <Row label="Vendor"         value={app.vendor} />
              <Row label="IT Contact"     value={app.itContact} />
              <Row label="Business Owner" value={app.businessOwner} />
              <Row label="Department"     value={app.department} />
              <Row label="Hours"          value={app.hoursOfOperation} />
              <Row label="Renewal Date"   value={app.renewalDate} />
              <Row label="Status"         value={app.status} />
              <Row label="Notes"          value={app.notes} />
              <Row label="Created By"     value={app.createdBy} />
              <Row label="Created At"     value={app.createdAt?.slice(0, 10)} />
              <Row label="Modified By"    value={app.modifiedBy} />
              <Row label="Modified At"    value={app.modifiedAt?.slice(0, 10)} />
            </div>
          )}

          {tab === 'audit' && isAdmin && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {audit.length === 0 && <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>No audit entries.</p>}
              {audit.map((e, i) => (
                <div key={i} className="audit-entry">
                  <div className="audit-entry-header">
                    <span className="audit-action">{e.action}</span>
                    <span className="audit-time">{e.timestamp.slice(0, 19).replace('T', ' ')}</span>
                  </div>
                  <div className="audit-user">{e.userEmail}</div>
                  {e.diff && Object.entries(e.diff).map(([field, { old: o, new: n }]) => (
                    <div key={field} className="audit-diff-field">
                      <span style={{ fontWeight: 500 }}>{field}:</span>{' '}
                      <span className="audit-diff-old">{String(o)}</span>{' → '}
                      <span className="audit-diff-new">{String(n)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-footer">
          {canEdit && (
            <button onClick={() => setEditing(true)} className="modal-btn modal-btn--outline-primary">
              Edit
            </button>
          )}
          {isAdmin && !confirmDel && (
            <button onClick={() => setConfirmDel(true)} className="modal-btn modal-btn--outline-danger">
              Delete
            </button>
          )}
          {confirmDel && (
            <>
              <button onClick={() => setConfirmDel(false)} className="modal-btn modal-btn--cancel">Cancel</button>
              <button onClick={handleDelete} disabled={busy} className="modal-btn modal-btn--danger">
                {busy ? 'Deleting…' : 'Confirm Delete'}
              </button>
            </>
          )}
        </div>

        {error && <p className="modal-error">{error}</p>}
      </div>
    </div>
  );
}
