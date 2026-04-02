import { useEffect, useState } from 'react';
import { api, App, AuditEntry } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import AppFormModal from './AppFormModal';
import './Modal.css';

interface ConfigMaps {
  serviceHours: Map<string, string>;
  serviceLevel: Map<string, string>;
  department:   Map<string, string>;
}

interface Props {
  app: App;
  configMaps: ConfigMaps;
  onClose: () => void;
  onChanged: () => void;
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="modal-row">
      <span className="modal-row-label">{label}</span>
      <span className="modal-row-value">{value ?? '—'}</span>
    </div>
  );
}

function pct(val?: number | null): string | undefined {
  if (val == null) return undefined;
  return `${val}%`;
}

export default function AppDetailModal({ app, configMaps, onClose, onChanged }: Props) {
  const { isAdmin, isEditor, email } = useAuth();
  const [tab,         setTab]         = useState<'detail' | 'audit'>('detail');
  const [audit,       setAudit]       = useState<AuditEntry[]>([]);
  const [auditLoaded, setAuditLoaded] = useState(false);
  const [editing,     setEditing]     = useState(false);
  const [confirmDel,  setConfirmDel]  = useState(false);
  const [busy,        setBusy]        = useState(false);
  const [error,       setError]       = useState('');

  const canEdit = isAdmin || (isEditor && (
    app.tmrsTechnicalContact === email || app.tmrsBusinessOwner === email
  ));

  useEffect(() => {
    if (tab === 'audit' && !auditLoaded) {
      api.getAudit(app.appId).then(r => { setAudit(r.entries); setAuditLoaded(true); });
    }
  }, [tab, auditLoaded, app.appId]);

  async function handleDelete() {
    setBusy(true);
    try {
      await api.deleteApp(app.appId);
      onChanged();
      onClose();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  function resolveLabel(map: Map<string, string>, id?: string): string | undefined {
    if (!id) return undefined;
    return map.get(id) ?? id;
  }

  if (editing) {
    return <AppFormModal app={app} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onChanged(); onClose(); }} />;
  }

  const shLabel = resolveLabel(configMaps.serviceHours, app.serviceHours);
  const slLabel = resolveLabel(configMaps.serviceLevel, app.serviceLevel);

  return (
    <div className="modal-overlay">
      <div className="modal modal--md">
        <div className="modal-header">
          <h2>{app.name}</h2>
          <button onClick={onClose} className="modal-close">×</button>
        </div>

        <div className="modal-tabs">
          {(['detail', 'audit'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`modal-tab${tab === t ? ' active' : ''}`}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="modal-body">
          {tab === 'detail' && (
            <div>
              <Row label="Description"               value={app.description} />
              <Row label="Vendor Name"               value={app.vendorName} />
              <Row label="Vendor Business Contact"   value={app.vendorBusinessContact} />
              <Row label="Vendor Technical Contact"  value={app.vendorTechnicalContact} />
              <Row label="TMRS Business Owner"       value={app.tmrsBusinessOwner} />
              <Row label="TMRS Business Contact"     value={app.tmrsBusinessContact} />
              <Row label="TMRS Technical Contact"    value={app.tmrsTechnicalContact} />
              <Row label="Service Hours"             value={shLabel} />
              <Row label="Service Level"             value={slLabel} />
              <Row label="Target Feature Util."      value={pct(app.targetFeatureUtilization)} />
              <Row label="Feature Util. Status"      value={pct(app.featureUtilizationStatus)} />
              <Row label="Business Criticality"      value={app.businessCriticality} />
              <Row label="Department"                value={resolveLabel(configMaps.department, app.department)} />
              <Row label="Next Contract Renewal"     value={app.renewalDate} />
              <Row label="Notes"                     value={app.notes} />
              <Row label="Status"                    value={app.status} />
              <Row label="Created By"                value={app.createdBy} />
              <Row label="Created At"                value={app.createdAt?.slice(0, 10)} />
              <Row label="Modified By"               value={app.modifiedBy} />
              <Row label="Modified At"               value={app.modifiedAt?.slice(0, 10)} />
            </div>
          )}

          {tab === 'audit' && (
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
                      <span className="audit-diff-old">{String(o ?? '—')}</span>{' → '}
                      <span className="audit-diff-new">{String(n ?? '—')}</span>
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
