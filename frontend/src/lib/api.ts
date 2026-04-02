import { fetchAuthSession } from 'aws-amplify/auth';

const BASE = 'https://aw3itbmhii.execute-api.us-east-2.amazonaws.com';

export interface App {
  appId: string;
  name: string;
  description: string;
  vendorName: string;
  tmrsBusinessOwner: string;
  tmrsBusinessContact?: string;
  tmrsTechnicalContact: string;
  vendorBusinessContact?: string;
  vendorTechnicalContact?: string;
  serviceHours: string;       // config value ID
  serviceLevel: string;       // config value ID
  targetFeatureUtilization?: number;
  featureUtilizationStatus?: number;
  businessCriticality?: 'Critical' | 'High' | 'Medium' | 'Low';
  department?: string;        // config value ID
  renewalDate?: string;
  notes?: string;
  status: 'active' | 'deleted';
  createdBy: string;
  createdAt: string;
  modifiedBy?: string;
  modifiedAt?: string;
}

export interface ContractDoc {
  docId: string;
  appId: string;
  filename: string;
  description: string;
  s3Key: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: string;
  uploadedAt: string;
  confirmed: boolean;
}

export interface AuditEntry {
  action: string;
  userEmail: string;
  timestamp: string;
  diff?: Record<string, { old: unknown; new: unknown }>;
}

// Config value shapes
export interface ConfigValue {
  id: string;
  label: string;
  sortOrder: number;
}

export interface ServiceHoursValue extends ConfigValue {
  definition: string;
  weeklyHours: number;
}

export interface ServiceLevelValue extends ConfigValue {
  percentage: number;
}

// DepartmentValue uses the base ConfigValue shape

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
  // Apps
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
  deleteMe:     () => request<void>('DELETE', '/users/me'),

  // Config lookups
  getConfig:          (category: string) => request<ConfigValue[]>('GET', `/config/${category}`),
  addConfigValue:     (category: string, body: Record<string, unknown>) =>
                        request<ConfigValue>('POST', `/config/${category}`, body),
  updateConfigValue:  (category: string, id: string, body: Record<string, unknown>) =>
                        request<ConfigValue>('PUT', `/config/${category}/values/${id}`, body),
  deleteConfigValue:  (category: string, id: string) =>
                        request<void>('DELETE', `/config/${category}/values/${id}`),
  seedConfig:         () => request<{ seeded: string[]; skipped: string[] }>('POST', '/config/seed'),

  // Contracts
  listContracts:      (appId: string) =>
                        request<{ items: ContractDoc[] }>('GET', `/apps/${appId}/contracts`),
  getUploadUrl:       (appId: string, body: { filename: string; contentType: string; sizeBytes: number; description: string }) =>
                        request<{ docId: string; uploadUrl: string }>('POST', `/apps/${appId}/contracts/upload-url`, body),
  confirmUpload:      (appId: string, docId: string) =>
                        request<ContractDoc>('POST', `/apps/${appId}/contracts/${docId}/confirm`),
  getDownloadUrl:     (appId: string, docId: string) =>
                        request<{ downloadUrl: string }>('GET', `/apps/${appId}/contracts/${docId}/download-url`),
  deleteContract:     (appId: string, docId: string) =>
                        request<void>('DELETE', `/apps/${appId}/contracts/${docId}`),
};
