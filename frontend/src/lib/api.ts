import { fetchAuthSession } from 'aws-amplify/auth';

const BASE = 'https://aw3itbmhii.execute-api.us-east-2.amazonaws.com';

export interface App {
  appId: string;
  name: string;
  description: string;
  vendor: string;
  itContact: string;
  businessOwner: string;
  department?: string;
  hoursOfOperation: string;
  status: 'active' | 'deleted';
  renewalDate?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
  modifiedBy?: string;
  modifiedAt?: string;
}

export interface AuditEntry {
  action: string;
  userEmail: string;
  timestamp: string;
  diff?: Record<string, { old: unknown; new: unknown }>;
}

async function authHeaders(): Promise<Record<string, string>> {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {
    ...(await authHeaders()),
    'Content-Type': 'application/json',
  };
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? `HTTP ${res.status}`);
  return data as T;
}

export const api = {
  listApps:    (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<{ items: App[] }>('GET', `/apps${qs}`);
  },
  listArchived: () => request<{ items: App[] }>('GET', '/apps/archived'),
  getApp:       (id: string) => request<App>('GET', `/apps/${id}`),
  createApp:    (body: Partial<App>) => request<App>('POST', '/apps', body),
  updateApp:    (id: string, body: Partial<App>) => request<App>('PUT', `/apps/${id}`, body),
  deleteApp:    (id: string) => request<void>('DELETE', `/apps/${id}`),
  restoreApp:   (id: string) => request<void>('POST', `/apps/${id}/restore`),
  getAudit:     (id: string) => request<{ entries: AuditEntry[] }>('GET', `/audit/${id}`),
};
