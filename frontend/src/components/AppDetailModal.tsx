import { useEffect, useRef, useState } from 'react';
import { api, App, AuditEntry, ContractDoc } from '../lib/api';
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
  initialTab?: 'detail' | 'audit' | 'contracts';
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

export default function AppDetailModal({ app, configMaps, onClose, onChanged, initialTab = 'detail' }: Props) {
  const { isAdmin, isEditor, email } = useAuth();
  const [tab,         setTab]         = useState<'detail' | 'audit' | 'contracts'>(initialTab);
  const [audit,       setAudit]       = useState<AuditEntry[]>([]);
  const [auditLoaded, setAuditLoaded] = useState(false);
  const [editing,     setEditing]     = useState(false);
  const [confirmDel,  setConfirmDel]  = useState(false);
  const [busy,        setBusy]        = useState(false);
  const [error,       setError]       = useState('');

  // Contracts state
  const [contracts,         setContracts]         = useState<ContractDoc[]>([]);
  const [contractsLoaded,   setContractsLoaded]   = useState(false);
  const [contractsError,    setContractsError]    = useState('');
  const [uploading,         setUploading]         = useState(false);
  const [uploadError,       setUploadError]       = useState('');
  const [confirmDelDoc,     setConfirmDelDoc]      = useState<string | null>(null);
  const [deletingDoc,       setDeletingDoc]        = useState(false);
  const [uploadDesc,        setUploadDesc]         = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canEdit = isAdmin || (isEditor && (
    app.tmrsTechnicalContact === email || app.tmrsBusinessOwner === email
  ));

  useEffect(() => {
    if (tab === 'audit' && !auditLoaded) {
      api.getAudit(app.appId).then(r => { setAudit(r.entries); setAuditLoaded(true); });
    }
    if (tab === 'contracts' && !contractsLoaded) {
      api.listContracts(app.appId)
        .then(r => { setContracts(r.items); setContractsLoaded(true); })
        .catch(e => setContractsError((e as Error).message));
    }
  }, [tab, auditLoaded, contractsLoaded, app.appId]);

  async function handleDelete() {
    setBusy(true);
    try {
      await api.deleteApp(app.appId);
      onChanged();
      onClose();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function handleUpload(file: File) {
    setUploading(true);
    setUploadError('');
    try {
      const { docId, uploadUrl } = await api.getUploadUrl(app.appId, {
        filename:    file.name,
        contentType: file.type,
        sizeBytes:   file.size,
        description: uploadDesc,
      });

      // PUT directly to S3 via presigned URL — no auth header here
      const s3Res = await fetch(uploadUrl, {
        method:  'PUT',
        headers: { 'Content-Type': file.type },
        body:    file,
      });
      if (!s3Res.ok) throw new Error(`S3 upload failed (${s3Res.status})`);

      const doc = await api.confirmUpload(app.appId, docId);
      setContracts(prev => [doc, ...prev]);
      setUploadDesc('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(docId: string) {
    try {
      const { downloadUrl } = await api.getDownloadUrl(app.appId, docId);
      window.open(downloadUrl, '_blank', 'noopener');
    } catch (e) {
      setContractsError((e as Error).message);
    }
  }

  async function handleDeleteDoc(docId: string) {
    setDeletingDoc(true);
    try {
      await api.deleteContract(app.appId, docId);
      setContracts(prev => prev.filter(d => d.docId !== docId));
      setConfirmDelDoc(null);
    } catch (e) {
      setContractsError((e as Error).message);
    } finally {
      setDeletingDoc(false);
    }
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
          {(['detail', 'contracts', 'audit'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`modal-tab${tab === t ? ' active' : ''}`}>
              {t === 'contracts'
                ? `Contracts${contracts.length > 0 ? ` (${contracts.length})` : ''}`
                : t.charAt(0).toUpperCase() + t.slice(1)}
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
              <Row label="Created By"                value={app.createdBy} />
              <Row label="Created At"                value={app.createdAt?.slice(0, 10)} />
              <Row label="Modified By"               value={app.modifiedBy} />
              <Row label="Modified At"               value={app.modifiedAt?.slice(0, 10)} />
            </div>
          )}

          {tab === 'contracts' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>

              {/* Upload area — admin/editor only */}
              {(isAdmin || isEditor) && (
                <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  <p style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-muted)', margin: 0 }}>Upload Document</p>
                  <input
                    type="text"
                    placeholder="Description (optional)"
                    value={uploadDesc}
                    onChange={e => setUploadDesc(e.target.value)}
                    style={{ padding: 'var(--space-2) var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', color: 'var(--color-text)', background: 'var(--color-surface)', fontFamily: 'var(--font-body)' }}
                  />
                  <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                      style={{ fontSize: 'var(--text-sm)', flex: 1 }}
                      onChange={e => { if (e.target.files?.[0]) handleUpload(e.target.files[0]); }}
                      disabled={uploading}
                    />
                    {uploading && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Uploading…</span>}
                  </div>
                  {uploadError && <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-error)', margin: 0 }}>{uploadError}</p>}
                </div>
              )}

              {/* Document list */}
              {contractsError && <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-error)', margin: 0 }}>{contractsError}</p>}
              {!contractsLoaded && <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>Loading…</p>}
              {contractsLoaded && contracts.length === 0 && (
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>No documents uploaded yet.</p>
              )}
              {contracts.map(doc => (
                <div key={doc.docId} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.filename}</div>
                      {doc.description && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{doc.description}</div>}
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--space-1)' }}>
                        {doc.uploadedBy} · {doc.uploadedAt.slice(0, 10)} · {(doc.sizeBytes / 1024).toFixed(0)} KB
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-2)', flexShrink: 0 }}>
                      <button onClick={() => handleDownload(doc.docId)} className="modal-btn modal-btn--outline-primary" style={{ flex: 'none', padding: 'var(--space-1) var(--space-3)' }}>
                        Download
                      </button>
                      {isAdmin && confirmDelDoc !== doc.docId && (
                        <button onClick={() => setConfirmDelDoc(doc.docId)} className="modal-btn modal-btn--outline-danger" style={{ flex: 'none', padding: 'var(--space-1) var(--space-3)' }}>
                          Delete
                        </button>
                      )}
                      {isAdmin && confirmDelDoc === doc.docId && (
                        <>
                          <button onClick={() => setConfirmDelDoc(null)} className="modal-btn modal-btn--cancel" style={{ flex: 'none', padding: 'var(--space-1) var(--space-3)' }}>Cancel</button>
                          <button onClick={() => handleDeleteDoc(doc.docId)} disabled={deletingDoc} className="modal-btn modal-btn--danger" style={{ flex: 'none', padding: 'var(--space-1) var(--space-3)' }}>
                            {deletingDoc ? 'Deleting…' : 'Confirm'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
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
          {!confirmDel && (
            <button onClick={onClose} className="modal-btn modal-btn--cancel">Done</button>
          )}
          {canEdit && !confirmDel && (
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
