import { useState, useEffect } from 'react';
import { api, ServiceHoursValue, ServiceLevelValue } from '../lib/api';
import './HelpPage.css';

const BASE = 'https://aw3itbmhii.execute-api.us-east-2.amazonaws.com';

// Monthly downtime allowance in minutes
function downtimeMins(weeklyHours: number, percentage: number): string {
  const mins = weeklyHours * (365 / 12 / 7) * 60 * (1 - percentage / 100);
  return mins >= 1 ? mins.toFixed(1) : mins.toFixed(2);
}

export default function HelpPage() {
  const [version,       setVersion]       = useState<string | null>(null);
  const [serviceHours,  setServiceHours]  = useState<ServiceHoursValue[]>([]);
  const [serviceLevels, setServiceLevels] = useState<ServiceLevelValue[]>([]);
  const [configLoading, setConfigLoading] = useState(true);

  useEffect(() => {
    fetch(`${BASE}/version`)
      .then(r => r.json())
      .then(data => setVersion(data.version))
      .catch(() => { /* version display is best-effort */ });

    Promise.all([
      api.getConfig('serviceHours'),
      api.getConfig('serviceLevel'),
    ]).then(([sh, sl]) => {
      setServiceHours(sh as ServiceHoursValue[]);
      setServiceLevels(sl as ServiceLevelValue[]);
    }).finally(() => setConfigLoading(false));
  }, []);

  return (
    <div className="help-page">
      <h1>Help</h1>

      <div className="help-section help-notice">
        <p>
          This application is not approved to store TMRS sensitive information.
        </p>
      </div>

      <div className="help-section">
        <h2>About App Registry</h2>
        <p>
          App Registry is a tool for capturing and managing a basic inventory of products
          in use, including internal business owner and technical contacts, service hours and
          expected availability during those hours, vendor and contract renewal information, rough
          estimates on feature utilization, and criticality to business. This tool provides an easy
          way to filter on and update these details.
        </p>
        <p>
          As of Version 0.4 administrative features related to domains, user, and database
          management have been removed from this application. These features are now provided
          in a centralized management tool instead at <a href="https://admin.tmrs.studio" target="_blank" rel="noreferrer">admin.tmrs.studio</a>.
        </p>
      </div>

      <div className="help-section">
        <h2>Downtime Allowances (monthly)</h2>
        <p className="help-section-note">
          Values calculated from current Service Hours and Service Level definitions.
          Admins can manage these definitions in the Admin → Lookups tab.
        </p>

        {configLoading && <p className="help-loading">Loading…</p>}

        {!configLoading && (serviceHours.length === 0 || serviceLevels.length === 0) && (
          <p className="help-loading">
            No Service Hours or Service Level values have been configured yet.
            An admin can seed or add them in Admin → Lookups.
          </p>
        )}

        {!configLoading && serviceHours.length > 0 && serviceLevels.length > 0 && (
          <div className="help-table-wrap">
            <table className="help-downtime-table">
              <thead>
                <tr>
                  <th>Service Hours</th>
                  {serviceLevels.map(sl => (
                    <th key={sl.id}>{sl.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {serviceHours.map(sh => (
                  <tr key={sh.id}>
                    <td>
                      <span className="help-sh-label">{sh.label}</span>
                      <span className="help-sh-def">({sh.definition})</span>
                    </td>
                    {serviceLevels.map(sl => (
                      <td key={sl.id} className="help-dt-cell">
                        {downtimeMins(sh.weeklyHours, sl.percentage)} min
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {version && (
        <div className="help-version">Version: {version}</div>
      )}
    </div>
  );
}
