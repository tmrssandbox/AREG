import { useState, FormEvent } from 'react';
import { api, App } from '../lib/api';
import './Modal.css';

const REQUIRED = ['name', 'description', 'vendor', 'itContact', 'businessOwner', 'hoursOfOperation'] as const;
const OPTIONAL  = ['department', 'renewalDate', 'notes'] as const;

const LABELS: Record<string, string> = {
  name: 'Application Name', description: 'Description', vendor: 'Vendor',
  itContact: 'IT Contact (email)', businessOwner: 'Business Owner (email)',
  hoursOfOperation: 'Hours of Operation', department: 'Department',
  renewalDate: 'Renewal Date', notes: 'Notes',
};

interface Props {
  app?: App;
  onClose: () => void;
  onSaved: () => void;
}

export default function AppFormModal({ app, onClose, onSaved }: Props) {
  const isEdit = !!app;
  const [form, setForm] = useState<Record<string, string>>({
    name:             app?.name ?? '',
    description:      app?.description ?? '',
    vendor:           app?.vendor ?? '',
    itContact:        app?.itContact ?? '',
    businessOwner:    app?.businessOwner ?? '',
    hoursOfOperation: app?.hoursOfOperation ?? '',
    department:       app?.department ?? '',
    renewalDate:      app?.renewalDate ?? '',
    notes:            app?.notes ?? '',
  });
  const [error, setError] = useState('');
  const [busy,  setBusy]  = useState(false);

  function field(key: string, type = 'text') {
    const isTextarea = key === 'notes' || key === 'description';
    return (
      <div key={key} className="modal-field">
        <label>{LABELS[key]}</label>
        {isTextarea
          ? <textarea
              value={form[key]}
              onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
              rows={3}
            />
          : <input
              type={type}
              value={form[key]}
              onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
            />
        }
      </div>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const missing = REQUIRED.filter(k => !form[k].trim());
    if (missing.length) { setError(`Required: ${missing.map(k => LABELS[k]).join(', ')}`); return; }
    setBusy(true);
    try {
      const payload = Object.fromEntries(
        Object.entries(form).filter(([, v]) => v.trim() !== ''),
      );
      if (isEdit) await api.updateApp(app.appId, payload);
      else        await api.createApp(payload);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal modal--sm">
        <div className="modal-header">
          <h2>{isEdit ? 'Edit Application' : 'Add Application'}</h2>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body modal-form">
            {REQUIRED.map(k => field(k, 'text'))}
            {OPTIONAL.map(k  => field(k, k === 'renewalDate' ? 'date' : 'text'))}
            {error && <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-error)', margin: 0 }}>{error}</p>}
          </div>
          <div className="modal-footer">
            <button type="button" onClick={onClose} className="modal-btn modal-btn--cancel">Cancel</button>
            <button type="submit" disabled={busy} className="modal-btn modal-btn--primary">
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
