import { useState, FormEvent } from 'react';
import { api, App } from '../lib/api';

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
    const cls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400';
    return (
      <div key={key}>
        <label className="block text-xs font-medium text-gray-600 mb-1">{LABELS[key]}</label>
        {isTextarea
          ? <textarea
              value={form[key]}
              onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
              rows={3}
              className={cls}
            />
          : <input
              type={type}
              value={form[key]}
              onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
              className={cls}
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
        <h2 className="text-lg font-bold mb-4">{isEdit ? 'Edit Application' : 'Add Application'}</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          {REQUIRED.map(k => field(k, 'text'))}
          {OPTIONAL.map(k  => field(k, k === 'renewalDate' ? 'date' : 'text'))}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-300 rounded-lg py-2 text-sm hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={busy}
              className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
