import { useState, FormEvent } from 'react';
import { updatePassword } from 'aws-amplify/auth';
import { useAuth } from '../contexts/AuthContext';
import './ProfilePage.css';

export default function ProfilePage() {
  const { email, role } = useAuth();

  const [oldPassword,     setOldPassword]     = useState('');
  const [newPassword,     setNewPassword]      = useState('');
  const [confirmPassword, setConfirmPassword]  = useState('');
  const [passwordMsg,     setPasswordMsg]      = useState('');
  const [passwordErr,     setPasswordErr]      = useState('');
  const [busy,            setBusy]             = useState(false);

  async function handlePasswordChange(e: FormEvent) {
    e.preventDefault();
    setPasswordErr('');
    setPasswordMsg('');
    if (newPassword !== confirmPassword) {
      setPasswordErr('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await updatePassword({ oldPassword, newPassword });
      setPasswordMsg('Password updated.');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      setPasswordErr(err instanceof Error ? err.message : 'Change failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-page">
      <h1>My Profile</h1>

      <section className="settings-section">
        <h2>Profile</h2>
        <p className="settings-desc">Your account is managed by your administrator.</p>
        <div className="settings-field">
          <label>Email</label>
          <input type="email" value={email ?? ''} disabled />
        </div>
        <div className="settings-field">
          <label>Role</label>
          <input type="text" value={role} disabled />
        </div>
      </section>

      <section className="settings-section">
        <h2>Change password</h2>
        <form onSubmit={handlePasswordChange}>
          {passwordErr && <div className="profile-error">{passwordErr}</div>}
          {passwordMsg && <div className="profile-success">{passwordMsg}</div>}
          <div className="settings-field">
            <label htmlFor="old-pw">Current password</label>
            <input
              id="old-pw"
              type="password"
              value={oldPassword}
              onChange={e => setOldPassword(e.target.value)}
              required
            />
          </div>
          <div className="settings-field">
            <label htmlFor="new-pw">New password</label>
            <input
              id="new-pw"
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <div className="settings-field">
            <label htmlFor="confirm-pw">Confirm new password</label>
            <input
              id="confirm-pw"
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn-save" disabled={busy}>
            {busy ? 'Changing…' : 'Change password'}
          </button>
        </form>
      </section>
    </div>
  );
}
