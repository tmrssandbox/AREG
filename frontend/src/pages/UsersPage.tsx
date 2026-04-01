import { useEffect, useState } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';

const BASE = 'https://aw3itbmhii.execute-api.us-east-2.amazonaws.com';

interface User {
  sub: string;
  email: string;
  role: string;
  enabled: boolean;
  status: string;
  createdAt: string;
}

async function authToken(): Promise<string> {
  const s = await fetchAuthSession();
  return s.tokens?.idToken?.toString() ?? '';
}

async function apiFetch(path: string, options?: RequestInit) {
  const token = await authToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...options?.headers },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? 'Request failed');
  return data;
}

export default function UsersPage() {
  const [users,   setUsers]   = useState<User[]>([]);
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState('');

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole,  setInviteRole]  = useState<'admin' | 'editor' | 'viewer'>('editor');
  const [inviting,    setInviting]    = useState(false);

  async function load() {
    setBusy(true); setError('');
    try {
      const data = await apiFetch('/users');
      setUsers(data.users ?? []);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  useEffect(() => { load(); }, []);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true); setError(''); setSuccess('');
    try {
      await apiFetch('/users/invite', {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      setSuccess(`Invitation sent to ${inviteEmail}`);
      setInviteEmail('');
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setInviting(false); }
  }

  async function toggleEnabled(user: User) {
    setError(''); setSuccess('');
    try {
      if (user.enabled) {
        await apiFetch(`/users/${user.sub}`, { method: 'DELETE' });
        setSuccess(`${user.email} deactivated`);
      } else {
        await apiFetch(`/users/${user.sub}/enable`, { method: 'POST' });
        setSuccess(`${user.email} re-enabled`);
      }
      await load();
    } catch (e) { setError((e as Error).message); }
  }

  const ROLES = ['admin', 'editor', 'viewer'] as const;
  const ROLE_COLORS: Record<string, string> = {
    admin:  'bg-purple-100 text-purple-700',
    editor: 'bg-blue-100 text-blue-700',
    viewer: 'bg-gray-100 text-gray-600',
  };
  // ADMIN-35: role management moved to admin.tmrs.studio

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-800">User Management</h1>

      {/* Invite form */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Invite New User</h2>
        <form onSubmit={invite} className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-48">
            <label className="block text-xs text-gray-500 mb-1">Email</label>
            <input
              type="email" required value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              placeholder="user@company.com"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Role</label>
            <select value={inviteRole} onChange={e => setInviteRole(e.target.value as typeof inviteRole)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
              {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
            </select>
          </div>
          <button type="submit" disabled={inviting}
            className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
            {inviting ? 'Sending…' : 'Send Invite'}
          </button>
        </form>
      </div>

      {error   && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-600">{success}</p>}

      {/* Users table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {busy ? (
          <p className="p-6 text-sm text-gray-500">Loading…</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Email</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Role</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Status</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Created</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.sub} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-3 font-medium text-gray-800">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ROLE_COLORS[u.role] ?? 'bg-gray-100 text-gray-600'}`}>
                      {u.role.charAt(0).toUpperCase() + u.role.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${u.enabled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      {u.enabled ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{u.createdAt?.slice(0, 10) ?? '—'}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleEnabled(u)}
                      className={`text-xs underline ${u.enabled ? 'text-red-500 hover:text-red-700' : 'text-indigo-500 hover:text-indigo-700'}`}
                    >
                      {u.enabled ? 'Deactivate' : 'Re-enable'}
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400 text-sm">No users found</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
