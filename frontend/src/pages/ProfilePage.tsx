import { useState, useEffect, FormEvent } from 'react';
import { updatePassword, setUpTOTP, verifyTOTPSetup, updateMFAPreference, fetchMFAPreference, deleteUser } from 'aws-amplify/auth';
import { QRCodeSVG } from 'qrcode.react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './ProfilePage.css';

type TotpStep = 'idle' | 'scan' | 'verify';

export default function ProfilePage() {
  const { email, role, logout } = useAuth();
  const navigate = useNavigate();

  // Change password
  const [oldPassword,     setOldPassword]     = useState('');
  const [newPassword,     setNewPassword]      = useState('');
  const [confirmPassword, setConfirmPassword]  = useState('');
  const [passwordMsg,     setPasswordMsg]      = useState('');
  const [passwordErr,     setPasswordErr]      = useState('');
  const [passwordBusy,    setPasswordBusy]     = useState(false);

  // MFA
  const [mfaEnabled,  setMfaEnabled]  = useState(false);
  const [totpStep,    setTotpStep]    = useState<TotpStep>('idle');
  const [totpUri,     setTotpUri]     = useState('');
  const [totpSecret,  setTotpSecret]  = useState('');
  const [totpCode,    setTotpCode]    = useState('');
  const [mfaMsg,      setMfaMsg]      = useState('');
  const [mfaErr,      setMfaErr]      = useState('');
  const [mfaBusy,     setMfaBusy]     = useState(false);

  // Delete account
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteErr,     setDeleteErr]     = useState('');
  const [deleteBusy,    setDeleteBusy]    = useState(false);

  useEffect(() => {
    fetchMFAPreference()
      .then(prefs => setMfaEnabled(prefs.preferred === 'TOTP' || (prefs.enabled?.includes('TOTP') ?? false)))
      .catch(() => {});
  }, []);

  async function handlePasswordChange(e: FormEvent) {
    e.preventDefault();
    setPasswordErr('');
    setPasswordMsg('');
    if (newPassword !== confirmPassword) {
      setPasswordErr('Passwords do not match.');
      return;
    }
    setPasswordBusy(true);
    try {
      await updatePassword({ oldPassword, newPassword });
      setPasswordMsg('Password updated.');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      setPasswordErr(err instanceof Error ? err.message : 'Change failed.');
    } finally {
      setPasswordBusy(false);
    }
  }

  async function handleSetupTotp() {
    setMfaErr('');
    setMfaMsg('');
    setMfaBusy(true);
    try {
      const setup = await setUpTOTP();
      const secret = setup.sharedSecret;
      const uri = setup.getSetupUri('AREG', email ?? undefined).toString();
      setTotpSecret(secret);
      setTotpUri(uri);
      setTotpStep('scan');
    } catch (err: unknown) {
      setMfaErr(err instanceof Error ? err.message : 'Setup failed.');
    } finally {
      setMfaBusy(false);
    }
  }

  async function handleVerifyTotp(e: FormEvent) {
    e.preventDefault();
    setMfaErr('');
    setMfaMsg('');
    setMfaBusy(true);
    try {
      await verifyTOTPSetup({ code: totpCode.trim() });
      await updateMFAPreference({ totp: 'PREFERRED' });
      setMfaEnabled(true);
      setTotpStep('idle');
      setTotpCode('');
      setMfaMsg('Two-factor authentication enabled.');
    } catch (err: unknown) {
      setMfaErr(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setMfaBusy(false);
    }
  }

  async function handleDisableMfa() {
    setMfaErr('');
    setMfaMsg('');
    setMfaBusy(true);
    try {
      await updateMFAPreference({ totp: 'NOT_PREFERRED' });
      setMfaEnabled(false);
      setMfaMsg('Two-factor authentication disabled.');
    } catch (err: unknown) {
      setMfaErr(err instanceof Error ? err.message : 'Failed to disable 2FA.');
    } finally {
      setMfaBusy(false);
    }
  }

  async function handleDeleteAccount() {
    if (deleteConfirm !== email) { setDeleteErr('Type your email to confirm.'); return; }
    setDeleteErr('');
    setDeleteBusy(true);
    try {
      await deleteUser();
      await logout();
      navigate('/login');
    } catch (err: unknown) {
      setDeleteErr(err instanceof Error ? err.message : 'Delete failed.');
      setDeleteBusy(false);
    }
  }

  return (
    <div className="settings-page">
      <h1>My Profile</h1>

      {/* Profile */}
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

      {/* Change password */}
      <section className="settings-section">
        <h2>Change password</h2>
        <form onSubmit={handlePasswordChange}>
          {passwordErr && <div className="profile-error">{passwordErr}</div>}
          {passwordMsg && <div className="profile-success">{passwordMsg}</div>}
          <div className="settings-field">
            <label htmlFor="old-pw">Current password</label>
            <input id="old-pw" type="password" value={oldPassword}
              onChange={e => setOldPassword(e.target.value)} required />
          </div>
          <div className="settings-field">
            <label htmlFor="new-pw">New password</label>
            <input id="new-pw" type="password" value={newPassword}
              onChange={e => setNewPassword(e.target.value)} required minLength={8} />
          </div>
          <div className="settings-field">
            <label htmlFor="confirm-pw">Confirm new password</label>
            <input id="confirm-pw" type="password" value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)} required />
          </div>
          <button type="submit" className="btn-save" disabled={passwordBusy}>
            {passwordBusy ? 'Changing…' : 'Change password'}
          </button>
        </form>
      </section>

      {/* Two-factor authentication */}
      <section className="settings-section">
        <h2>Two-factor authentication</h2>
        {mfaErr && <div className="profile-error">{mfaErr}</div>}
        {mfaMsg && <div className="profile-success">{mfaMsg}</div>}

        {mfaEnabled ? (
          <>
            <p className="settings-desc">
              Two-factor authentication is <strong>enabled</strong>. You will be asked for a code
              from your authenticator app on every sign in.
            </p>
            <button className="btn-danger" onClick={handleDisableMfa} disabled={mfaBusy}>
              {mfaBusy ? 'Disabling…' : 'Disable 2FA'}
            </button>
          </>
        ) : (
          <>
            <p className="settings-desc">Add an extra layer of security using an authenticator app.</p>

            {totpStep === 'idle' && (
              <button className="btn-save" onClick={handleSetupTotp} disabled={mfaBusy}>
                {mfaBusy ? 'Setting up…' : 'Set up authenticator'}
              </button>
            )}

            {totpStep === 'scan' && (
              <div className="mfa-setup">
                <p className="settings-desc">
                  Scan the QR code with Google Authenticator, Authy, or any TOTP app. Or enter
                  the secret key manually.
                </p>
                <div className="mfa-qr">
                  <QRCodeSVG value={totpUri} size={180} />
                </div>
                <code className="totp-secret">{totpSecret}</code>
                <form onSubmit={handleVerifyTotp} className="mfa-verify-form">
                  <div className="settings-field">
                    <label htmlFor="totp-code">Enter the 6-digit code from your app to confirm</label>
                    <input id="totp-code" type="text" value={totpCode}
                      onChange={e => setTotpCode(e.target.value)}
                      required maxLength={6} autoFocus inputMode="numeric" />
                  </div>
                  <button type="submit" className="btn-save" disabled={mfaBusy}>
                    {mfaBusy ? 'Verifying…' : 'Verify and enable'}
                  </button>
                </form>
              </div>
            )}
          </>
        )}
      </section>
      {/* Delete account */}
      <section className="settings-section settings-danger">
        <h2>Delete account</h2>
        <p className="settings-desc">
          Permanently delete your account. This cannot be undone.
        </p>
        {deleteErr && <div className="profile-error">{deleteErr}</div>}
        <div className="settings-field">
          <label htmlFor="delete-confirm">
            Type your email to confirm: <strong>{email}</strong>
          </label>
          <input
            id="delete-confirm"
            type="email"
            value={deleteConfirm}
            onChange={e => setDeleteConfirm(e.target.value)}
            placeholder={email ?? ''}
          />
        </div>
        <button
          className="btn-danger"
          onClick={handleDeleteAccount}
          disabled={deleteBusy || deleteConfirm !== email}
        >
          {deleteBusy ? 'Deleting…' : 'Delete my account'}
        </button>
      </section>
    </div>
  );
}
