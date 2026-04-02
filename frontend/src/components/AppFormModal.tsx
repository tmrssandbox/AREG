import { useState, useEffect, FormEvent } from 'react';
import { api, App, ServiceHoursValue, ServiceLevelValue, ConfigValue } from '../lib/api';
import './Modal.css';

// Monthly downtime minutes for a given service hours + service level combination
function downtimeMins(weeklyHours: number, percentage: number): string {
  const mins = weeklyHours * (365 / 12 / 7) * 60 * (1 - percentage / 100);
  return mins >= 1 ? mins.toFixed(1) : mins.toFixed(2);
}

function Info({ tip }: { tip: string }) {
  return <span className="field-info" data-tip={tip}>i</span>;
}

interface Props {
  app?: App;
  onClose: () => void;
  onSaved: () => void;
}

export default function AppFormModal({ app, onClose, onSaved }: Props) {
  const isEdit = !!app;

  const [form, setForm] = useState({
    name:                     app?.name ?? '',
    description:              app?.description ?? '',
    tmrsBusinessOwner:        app?.tmrsBusinessOwner ?? '',
    tmrsBusinessContact:      app?.tmrsBusinessContact ?? '',
    tmrsTechnicalContact:     app?.tmrsTechnicalContact ?? '',
    vendorName:               app?.vendorName ?? '',
    vendorBusinessContact:    app?.vendorBusinessContact ?? '',
    vendorTechnicalContact:   app?.vendorTechnicalContact ?? '',
    serviceHours:             app?.serviceHours ?? '',
    serviceLevel:             app?.serviceLevel ?? '',
    targetFeatureUtilization: app?.targetFeatureUtilization != null ? String(app.targetFeatureUtilization) : '',
    featureUtilizationStatus: app?.featureUtilizationStatus != null ? String(app.featureUtilizationStatus) : '',
    businessCriticality:      app?.businessCriticality ?? '',
    department:               app?.department ?? '',
    renewalDate:              app?.renewalDate ?? '',
    notes:                    app?.notes ?? '',
  });

  const [serviceHoursList, setServiceHoursList] = useState<ServiceHoursValue[]>([]);
  const [serviceLevelList, setServiceLevelList] = useState<ServiceLevelValue[]>([]);
  const [departmentList,   setDepartmentList]   = useState<ConfigValue[]>([]);
  const [configLoading,    setConfigLoading]    = useState(true);
  const [error, setError] = useState('');
  const [busy,  setBusy]  = useState(false);

  useEffect(() => {
    Promise.all([
      api.getConfig('serviceHours'),
      api.getConfig('serviceLevel'),
      api.getConfig('department'),
    ]).then(([sh, sl, dept]) => {
      setServiceHoursList(sh as ServiceHoursValue[]);
      setServiceLevelList(sl as ServiceLevelValue[]);
      setDepartmentList(dept);
    }).finally(() => setConfigLoading(false));
  }, []);

  function set(key: string, value: string) {
    setForm(f => ({ ...f, [key]: value }));
  }

  // Find selected service hours weeklyHours for downtime label computation
  const selectedSH = serviceHoursList.find(sh => sh.id === form.serviceHours);

  function slLabel(sl: ServiceLevelValue): string {
    if (selectedSH) {
      return `${sl.label} (~${downtimeMins(selectedSH.weeklyHours, sl.percentage)} min/mo)`;
    }
    return sl.label;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    const REQUIRED_KEYS = ['name', 'description', 'vendorName', 'tmrsBusinessOwner', 'tmrsTechnicalContact', 'serviceHours', 'serviceLevel'] as const;
    const REQUIRED_LABELS: Record<string, string> = {
      name: 'Name', description: 'Description', vendorName: 'Vendor Name',
      tmrsBusinessOwner: 'TMRS Business Owner', tmrsTechnicalContact: 'TMRS Technical Contact',
      serviceHours: 'Service Hours', serviceLevel: 'Service Level',
    };
    const missing = REQUIRED_KEYS.filter(k => !form[k].trim());
    if (missing.length) {
      setError(`Required: ${missing.map(k => REQUIRED_LABELS[k]).join(', ')}`);
      return;
    }

    // Validate percentage fields
    for (const k of ['targetFeatureUtilization', 'featureUtilizationStatus'] as const) {
      if (form[k] !== '') {
        const n = Number(form[k]);
        if (isNaN(n) || n < 0 || n > 100) {
          setError(`${k === 'targetFeatureUtilization' ? 'Target Feature Utilization' : 'Feature Utilization Status'} must be 0–100`);
          return;
        }
      }
    }

    setBusy(true);
    try {
      const payload: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(form)) {
        if (k === 'targetFeatureUtilization' || k === 'featureUtilizationStatus') {
          payload[k] = v !== '' ? Number(v) : undefined;
        } else if (v !== '') {
          payload[k] = v;
        } else {
          payload[k] = undefined; // allow clearing optional fields on edit
        }
      }

      if (isEdit) await api.updateApp(app.appId, payload as Partial<App>);
      else        await api.createApp(payload as Partial<App>);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function textField(key: string, label: string, tip?: string, type = 'text') {
    return (
      <div className="modal-field">
        <label>{label}{tip && <Info tip={tip} />}</label>
        <input type={type} value={(form as Record<string, string>)[key]}
          onChange={e => set(key, e.target.value)} />
      </div>
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal modal--lg">
        <div className="modal-header">
          <h2>{isEdit ? 'Edit Application' : 'Add Application'}</h2>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body modal-form">
            {configLoading && <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>Loading…</p>}

            {/* Application Info */}
            {textField('name', 'Name', 'Short name of application. Can be changed later.')}
            <div className="modal-field">
              <label>Description <Info tip="Brief description of what the application is for." /></label>
              <textarea rows={3} value={form.description} onChange={e => set('description', e.target.value)} />
            </div>

            {/* TMRS Contacts */}
            {textField('tmrsBusinessOwner',    'TMRS Business Owner',   'Internal sponsor for the application.')}
            {textField('tmrsBusinessContact',  'TMRS Business Contact', 'Internal SME on application usage.')}
            {textField('tmrsTechnicalContact', 'TMRS Technical Contact','Internal technical contact.')}

            {/* Vendor */}
            {textField('vendorName',            'Vendor Name',             'Name of vendor. Can be changed later.')}
            {textField('vendorBusinessContact', 'Vendor Business Contact')}
            {textField('vendorTechnicalContact','Vendor Technical Contact')}

            {/* Service */}
            <div className="modal-field">
              <label>Service Hours <Info tip="Committed hours of operation for this application." /></label>
              <select value={form.serviceHours} onChange={e => set('serviceHours', e.target.value)}>
                <option value="">— Select —</option>
                {serviceHoursList.map(sh => (
                  <option key={sh.id} value={sh.id}>{sh.label} ({sh.definition})</option>
                ))}
              </select>
            </div>

            <div className="modal-field">
              <label>Service Level <Info tip="Allowable monthly downtime during Service Hours." /></label>
              <select value={form.serviceLevel} onChange={e => set('serviceLevel', e.target.value)}>
                <option value="">— Select —</option>
                {serviceLevelList.map(sl => (
                  <option key={sl.id} value={sl.id}>{slLabel(sl)}</option>
                ))}
              </select>
            </div>

            {/* Feature Utilization */}
            <div className="modal-field">
              <label>Target Feature Utilization <Info tip="Percentage of features offered that are intended for use. Most products are targeted for specific use and may offer far more than is needed." /></label>
              <input type="number" min={0} max={100} step={1}
                placeholder="0–100, leave blank if unknown"
                value={form.targetFeatureUtilization}
                onChange={e => set('targetFeatureUtilization', e.target.value)} />
            </div>

            <div className="modal-field">
              <label>Feature Utilization Status <Info tip="Percentage progress on using intended features." /></label>
              <input type="number" min={0} max={100} step={1}
                placeholder="0–100, leave blank if unknown"
                value={form.featureUtilizationStatus}
                onChange={e => set('featureUtilizationStatus', e.target.value)} />
            </div>

            {/* Classification */}
            <div className="modal-field">
              <label>Business Criticality</label>
              <select value={form.businessCriticality} onChange={e => set('businessCriticality', e.target.value)}>
                <option value="">— Select —</option>
                {['Critical', 'High', 'Medium', 'Low'].map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>

            <div className="modal-field">
              <label>Department</label>
              <select value={form.department} onChange={e => set('department', e.target.value)}>
                <option value="">— Select —</option>
                {departmentList.map(d => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>
            </div>

            {textField('renewalDate', 'Next Contract Renewal Date', undefined, 'date')}

            <div className="modal-field">
              <label>Notes</label>
              <textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>

            {error && <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-error)', margin: 0 }}>{error}</p>}
          </div>
          <div className="modal-footer">
            <button type="button" onClick={onClose} className="modal-btn modal-btn--cancel">Cancel</button>
            <button type="submit" disabled={busy || configLoading} className="modal-btn modal-btn--primary">
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
