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
          Application Registry is a centralized catalog for tracking TMRS Studios software
          applications. It allows administrators to record and manage key details for each
          application including vendor information, IT contacts, business owners, renewal
          dates, and hours of operation.
        </p>
        <p>
          The registry provides a searchable catalog of active applications, an archive for
          retired applications, bulk import capabilities, and a full change history for
          audit purposes. Access is role-based: standard users can view the catalog, while
          administrators can create, edit, and manage applications and users.
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
