import { useState, useEffect } from 'react';
import './HelpPage.css';

const BASE = 'https://aw3itbmhii.execute-api.us-east-2.amazonaws.com';

export default function HelpPage() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${BASE}/version`)
      .then(r => r.json())
      .then(data => setVersion(data.version))
      .catch(() => { /* version display is best-effort */ });
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
        <h2>About Application Registry</h2>
        <p>
          Application Registry is a tool for capturing and managing a basic inventory of products
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

      {version && (
        <div className="help-version">
          Version: {version}
        </div>
      )}
    </div>
  );
}
